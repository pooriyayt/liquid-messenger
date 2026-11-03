<?php
/**
 * Server-Side Encryption Service for Cloud Messages & Media
 * Similar to Telegram Cloud Encryption Architecture (AES-256-GCM / AES-256-CTR).
 * Messages and files are securely encrypted before storage and decrypted on-the-fly for authorized sessions.
 */

class Encryption {
    /**
     * Get 32-byte binary server encryption key.
     */
    public static function getServerKey() {
        if (defined('APP_ENC_KEY')) {
            $raw = base64_decode(APP_ENC_KEY, true);
            if ($raw !== false && strlen($raw) === 32) {
                return $raw;
            }
        }
        // Deterministic fallback derived from environment/database credentials
        $seed = defined('DB_PASS') ? (DB_PASS . 'liquid_cloud_master_salt') : 'liquid_cloud_master_salt_2026';
        return hash('sha256', $seed, true);
    }

    /**
     * Helper to increment a 16-byte CTR IV counter by a block count.
     */
    private static function incrementIv($iv, $blocks) {
        $len = strlen($iv);
        $bytes = array_values(unpack('C*', $iv));
        $carry = $blocks;
        for ($i = $len - 1; $i >= 0 && $carry > 0; $i--) {
            $sum = $bytes[$i] + ($carry & 0xFF);
            $bytes[$i] = $sum & 0xFF;
            $carry = ($carry >> 8) + ($sum >> 8);
        }
        return pack('C*', ...$bytes);
    }

    /**
     * Encrypt message text or JSON payload before storing in database.
     * Uses AES-256-GCM with authenticated tag.
     * Output format: "v2:" + base64(IV[12] + Tag[16] + Ciphertext)
     */
    public static function encryptMessage($plaintext) {
        if ($plaintext === null || $plaintext === '') {
            return '';
        }
        $key = self::getServerKey();
        if (!$key || !function_exists('openssl_encrypt')) {
            return $plaintext;
        }
        $iv = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt((string) $plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($ciphertext === false) {
            return $plaintext;
        }
        return 'v2:' . base64_encode($iv . $tag . $ciphertext);
    }

    /**
     * Decrypt message text or payload retrieved from database.
     * Automatically handles:
     * - "v2:" (new server-side AES-256-GCM cloud messages)
     * - "v1:" (legacy wrapped messages)
     * - plaintext messages (legacy unencrypted)
     */
    public static function decryptMessage($payload) {
        if ($payload === null || $payload === '') {
            return '';
        }
        if (!is_string($payload)) {
            return (string) $payload;
        }

        // New format: v2:
        if (strpos($payload, 'v2:') === 0) {
            $key = self::getServerKey();
            if (!$key || !function_exists('openssl_decrypt')) {
                return $payload;
            }
            $raw = base64_decode(substr($payload, 3), true);
            if ($raw === false || strlen($raw) < 28) {
                return '';
            }
            $iv = substr($raw, 0, 12);
            $tag = substr($raw, 12, 16);
            $ciphertext = substr($raw, 28);
            $plaintext = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
            return $plaintext === false ? '' : $plaintext;
        }

        // Legacy format: v1:
        if (strpos($payload, 'v1:') === 0) {
            $raw = base64_decode(substr($payload, 3), true);
            if ($raw === false) {
                return $payload;
            }
            if (strlen($raw) >= 28) {
                $key = self::getServerKey();
                if ($key && function_exists('openssl_decrypt')) {
                    $iv = substr($raw, 0, 12);
                    $tag = substr($raw, 12, 16);
                    $ciphertext = substr($raw, 28);
                    $dec = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
                    if ($dec !== false) {
                        $raw = $dec;
                    }
                }
            }

            // Check if unwrapped payload was a legacy client E2EE json
            $trimmed = trim($raw);
            if (strpos($trimmed, '{') === 0 && strpos($trimmed, '}') !== false) {
                $decoded = json_decode($trimmed, true);
                if (is_array($decoded)) {
                    if (isset($decoded['text']) && is_string($decoded['text'])) {
                        return $decoded['text'];
                    }
                    if (isset($decoded['message']) && is_string($decoded['message'])) {
                        return $decoded['message'];
                    }
                    if (isset($decoded['caption']) && is_string($decoded['caption'])) {
                        return $decoded['caption'];
                    }
                }
            }
            return $raw;
        }

        // Plaintext or JSON fallback
        return $payload;
    }

    /**
     * Backward-compatible alias for wrapping profile fields and ciphertext.
     */
    public static function wrapForStorage($plaintext) {
        return self::encryptMessage($plaintext);
    }

    /**
     * Backward-compatible alias for unwrapping profile fields and ciphertext.
     */
    public static function unwrapFromStorage($payload) {
        return self::decryptMessage($payload);
    }

    /**
     * Encrypt an uploaded file at rest on disk.
     * Uses AES-256-CTR with random 16-byte IV.
     * Output format on disk:
     * - Magic "LENC\x01" (5 bytes)
     * - IV (16 bytes)
     * - Original size 64-bit int (8 bytes)
     * - Ciphertext stream
     */
    public static function encryptFile($sourcePath, $destPath) {
        $key = self::getServerKey();
        if (!$key || !function_exists('openssl_encrypt')) {
            return false;
        }
        if (!file_exists($sourcePath) || !is_readable($sourcePath)) {
            return false;
        }

        $size = filesize($sourcePath);
        $iv = random_bytes(16);

        $in = fopen($sourcePath, 'rb');
        $out = fopen($destPath, 'wb');
        if (!$in || !$out) {
            if ($in) fclose($in);
            if ($out) fclose($out);
            return false;
        }

        // Write header: 5 bytes magic + 16 bytes IV + 8 bytes original size = 29 bytes
        fwrite($out, "LENC\x01" . $iv . pack('J', $size));

        $chunkSize = 65536; // 64KB per chunk
        $blockCount = 0;
        while (!feof($in)) {
            $buffer = fread($in, $chunkSize);
            if ($buffer === false || $buffer === '') {
                break;
            }
            $chunkIv = self::incrementIv($iv, $blockCount);
            $encrypted = openssl_encrypt($buffer, 'aes-256-ctr', $key, OPENSSL_RAW_DATA, $chunkIv);
            fwrite($out, $encrypted);
            $blockCount += (int) ceil(strlen($buffer) / 16);
        }

        fclose($in);
        fclose($out);
        return true;
    }

    /**
     * Check if a file on disk has the LENC\x01 encryption header.
     */
    public static function isEncryptedFile($filePath) {
        if (!file_exists($filePath) || filesize($filePath) < 29) {
            return false;
        }
        $f = @fopen($filePath, 'rb');
        if (!$f) {
            return false;
        }
        $magic = fread($f, 5);
        fclose($f);
        return $magic === "LENC\x01";
    }

    /**
     * Get original file size (either from encrypted header or regular file).
     */
    public static function getFileSize($filePath) {
        if (!file_exists($filePath)) {
            return 0;
        }
        if (self::isEncryptedFile($filePath)) {
            $f = @fopen($filePath, 'rb');
            if (!$f) return 0;
            fseek($f, 21); // Skip 5 bytes magic + 16 bytes IV
            $sizeBinary = fread($f, 8);
            fclose($f);
            if (strlen($sizeBinary) === 8) {
                $unpacked = unpack('Jsize', $sizeBinary);
                return (int) ($unpacked['size'] ?? 0);
            }
        }
        return (int) filesize($filePath);
    }

    /**
     * Stream file to client (decrypting on the fly if encrypted).
     * Supports HTTP Range requests for video/audio seeking with minimal memory.
     */
    public static function streamFile($filePath, $start = 0, $length = null, $chunkSize = 65536) {
        if (!file_exists($filePath)) {
            return false;
        }

        $isEnc = self::isEncryptedFile($filePath);
        if (!$isEnc) {
            // Unencrypted legacy file: stream directly
            $f = @fopen($filePath, 'rb');
            if (!$f) return false;
            if ($start > 0) {
                fseek($f, $start);
            }
            $remaining = $length !== null ? $length : (filesize($filePath) - $start);
            while (!feof($f) && $remaining > 0) {
                $readSize = min($chunkSize, $remaining);
                $data = fread($f, $readSize);
                if ($data === false || $data === '') break;
                echo $data;
                flush();
                $remaining -= strlen($data);
            }
            fclose($f);
            return true;
        }

        // Encrypted file: stream and decrypt on the fly
        $key = self::getServerKey();
        if (!$key) return false;

        $f = @fopen($filePath, 'rb');
        if (!$f) return false;

        $header = fread($f, 29);
        $iv = substr($header, 5, 16);
        $sizeArr = unpack('Jsize', substr($header, 21, 8));
        $originalSize = (int) ($sizeArr['size'] ?? 0);

        if ($length === null) {
            $length = $originalSize - $start;
        }
        if ($length <= 0) {
            fclose($f);
            return true;
        }

        $remaining = $length;
        $currentOffset = $start;

        while ($remaining > 0 && !feof($f)) {
            $readLength = min($chunkSize, $remaining);
            $blockIndex = (int) floor($currentOffset / 16);
            $blockRemainder = $currentOffset % 16;
            $cipherFileOffset = 29 + ($blockIndex * 16);

            fseek($f, $cipherFileOffset);
            $chunkIv = self::incrementIv($iv, $blockIndex);

            $bytesToRead = $readLength + $blockRemainder;
            $cipherData = fread($f, $bytesToRead);
            if ($cipherData === false || $cipherData === '') {
                break;
            }

            $decrypted = openssl_decrypt($cipherData, 'aes-256-ctr', $key, OPENSSL_RAW_DATA, $chunkIv);
            if ($decrypted === false) {
                break;
            }

            $plainChunk = substr($decrypted, $blockRemainder, $readLength);
            echo $plainChunk;
            flush();

            $chunkLen = strlen($plainChunk);
            $currentOffset += $chunkLen;
            $remaining -= $chunkLen;
            if ($chunkLen === 0) break;
        }

        fclose($f);
        return true;
    }

    /**
     * Legacy stubs for user_keys table so old calls don't crash.
     */
    public static function storeUserKeys($userId, $publicKey, $encryptedPrivateKey, $keyParams, $conn) {
        return true;
    }

    public static function getUserKeys($userId, $conn) {
        return [
            'public_key' => null,
            'encrypted_private_key' => null,
            'key_params' => null
        ];
    }
}
