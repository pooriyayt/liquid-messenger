<?php
if (!file_exists(__DIR__ . '/../includes/config.php') || (!file_exists(__DIR__ . '/../installed.lock') && !file_exists(__DIR__ . '/../storage/installed.lock'))) {
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'installed' => false, 'message' => 'System not installed. Please run install.php']);
    exit;
}
require_once __DIR__ . '/../includes/config.php';
require_once '../includes/functions.php';
require_once '../includes/auth.php';
require_once '../includes/encryption.php';

header('Content-Type: application/json');

$action = isset($_GET['action']) ? (string) $_GET['action'] : '';
if ($action !== 'upload') {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Unknown action']);
    exit;
}

if (!Auth::isLoggedIn()) {
    echo json_encode(['success' => false, 'message' => 'User not authenticated']);
    exit;
}

function lc_upload_detect_mime_type($filePath, $fallback)
{
    if (function_exists('finfo_open')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $detected = finfo_file($finfo, $filePath);
            finfo_close($finfo);
            if (is_string($detected) && $detected !== '') {
                return $detected;
            }
        }
    }
    return $fallback;
}

function lc_upload_allowed_image_extensions()
{
    return [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
        'image/gif' => ['gif'],
        'image/webp' => ['webp'],
    ];
}

function lc_upload_is_allowed_image_extension($mimeType, $extension)
{
    $allowed = lc_upload_allowed_image_extensions();
    return isset($allowed[$mimeType]) && in_array($extension, $allowed[$mimeType], true);
}

function lc_upload_normalize_extension($name)
{
    $extension = strtolower((string) pathinfo((string) $name, PATHINFO_EXTENSION));
    return $extension === 'jpg' ? 'jpeg' : $extension;
}

function lc_upload_safe_original_name($name)
{
    $name = basename((string) $name);
    $name = preg_replace('/[^A-Za-z0-9._-]/', '_', $name);
    return $name !== '' ? $name : 'upload.bin';
}

function lc_upload_apply_orientation($image, $orientation)
{
    if (!$image) {
        return $image;
    }
    switch ((int) $orientation) {
        case 2:
            if (function_exists('imageflip')) {
                imageflip($image, IMG_FLIP_HORIZONTAL);
            }
            break;
        case 3:
            $image = imagerotate($image, 180, 0);
            break;
        case 4:
            if (function_exists('imageflip')) {
                imageflip($image, IMG_FLIP_VERTICAL);
            }
            break;
        case 5:
            $image = imagerotate($image, -90, 0);
            if (function_exists('imageflip')) {
                imageflip($image, IMG_FLIP_HORIZONTAL);
            }
            break;
        case 6:
            $image = imagerotate($image, -90, 0);
            break;
        case 7:
            $image = imagerotate($image, 90, 0);
            if (function_exists('imageflip')) {
                imageflip($image, IMG_FLIP_HORIZONTAL);
            }
            break;
        case 8:
            $image = imagerotate($image, 90, 0);
            break;
    }
    return $image;
}

function lc_upload_get_jpeg_orientation($filePath)
{
    if (!function_exists('exif_read_data')) {
        return 1;
    }
    $exif = @exif_read_data($filePath);
    return is_array($exif) && !empty($exif['Orientation']) ? (int) $exif['Orientation'] : 1;
}

function lc_upload_validate_image_file($filePath, $mimeType, $extension)
{
    $imageInfo = @getimagesize($filePath);
    if (!is_array($imageInfo) || empty($imageInfo['mime'])) {
        return false;
    }

    $imageMimeType = (string) $imageInfo['mime'];
    if ($imageMimeType !== $mimeType) {
        return false;
    }

    return lc_upload_is_allowed_image_extension($imageMimeType, $extension);
}

function lc_upload_create_truecolor_copy($sourceImage, $mimeType)
{
    $width = imagesx($sourceImage);
    $height = imagesy($sourceImage);
    $copy = imagecreatetruecolor($width, $height);
    if (!$copy) {
        return false;
    }

    if ($mimeType === 'image/png' || $mimeType === 'image/gif' || $mimeType === 'image/webp') {
        imagealphablending($copy, false);
        imagesavealpha($copy, true);
        $transparent = imagecolorallocatealpha($copy, 0, 0, 0, 127);
        imagefilledrectangle($copy, 0, 0, $width, $height, $transparent);
    }

    if (!imagecopy($copy, $sourceImage, 0, 0, 0, 0, $width, $height)) {
        imagedestroy($copy);
        return false;
    }

    return $copy;
}

function lc_upload_jpeg_contains_metadata($filePath)
{
    $data = @file_get_contents($filePath);
    if ($data === false || strlen($data) < 4 || substr($data, 0, 2) !== "\xFF\xD8") {
        return true;
    }

    $length = strlen($data);
    $offset = 2;
    while ($offset + 4 <= $length) {
        if ($data[$offset] !== "\xFF") {
            break;
        }
        while ($offset < $length && $data[$offset] === "\xFF") {
            $offset++;
        }
        if ($offset >= $length) {
            break;
        }

        $marker = ord($data[$offset]);
        $offset++;
        if ($marker === 0xD9 || $marker === 0xDA) {
            break;
        }
        if ($offset + 2 > $length) {
            break;
        }

        $segmentLength = unpack('n', substr($data, $offset, 2))[1] ?? 0;
        if ($segmentLength < 2 || $offset + $segmentLength > $length) {
            return true;
        }

        $payload = substr($data, $offset + 2, $segmentLength - 2);
        if ($marker === 0xE1 && (
            strncmp($payload, "Exif\x00\x00", 6) === 0 ||
            strncmp($payload, "http://ns.adobe.com/xap/1.0/\x00", 29) === 0
        )) {
            return true;
        }
        if ($marker === 0xE2 && (
            strncmp($payload, "ICC_PROFILE\x00", 12) === 0 ||
            strncmp($payload, "MPF\x00", 4) === 0
        )) {
            return true;
        }
        if ($marker === 0xED && strncmp($payload, "Photoshop 3.0\x00", 14) === 0) {
            return true;
        }
        if ($marker === 0xFE && trim($payload, "\x00") !== '') {
            return true;
        }

        $offset += $segmentLength;
    }

    if (function_exists('exif_read_data')) {
        $exif = @exif_read_data($filePath);
        if (is_array($exif)) {
            foreach ($exif as $key => $value) {
                if (is_string($key) && $key !== 'FileName' && $key !== 'FileDateTime' && $key !== 'FileSize' && $key !== 'FileType' && $key !== 'MimeType' && $key !== 'SectionsFound' && $value !== null && $value !== '') {
                    return true;
                }
            }
        }
    }

    return false;
}

function lc_upload_png_contains_metadata($filePath)
{
    $data = @file_get_contents($filePath);
    $signature = "\x89PNG\r\n\x1A\n";
    if ($data === false || substr($data, 0, 8) !== $signature) {
        return true;
    }

    $length = strlen($data);
    $offset = 8;
    while ($offset + 12 <= $length) {
        $chunkLength = unpack('N', substr($data, $offset, 4))[1];
        $chunkType = substr($data, $offset + 4, 4);
        $chunkTotal = 12 + $chunkLength;
        if ($offset + $chunkTotal > $length) {
            return true;
        }
        if (in_array($chunkType, ['tEXt', 'zTXt', 'iTXt', 'eXIf', 'iCCP', 'tIME'], true)) {
            return true;
        }
        $offset += $chunkTotal;
        if ($chunkType === 'IEND') {
            return false;
        }
    }

    return true;
}

function lc_upload_gif_contains_metadata($filePath)
{
    $data = @file_get_contents($filePath);
    if ($data === false || (substr($data, 0, 6) !== 'GIF87a' && substr($data, 0, 6) !== 'GIF89a')) {
        return true;
    }

    $length = strlen($data);
    if ($length < 13) {
        return true;
    }

    $offset = 13;
    $packed = ord($data[10]);
    if ($packed & 0x80) {
        $offset += 3 * (2 ** (($packed & 0x07) + 1));
        if ($offset > $length) {
            return true;
        }
    }

    while ($offset < $length) {
        $byte = ord($data[$offset]);
        if ($byte === 0x3B) {
            return false;
        }
        if ($byte === 0x21) {
            if ($offset + 2 > $length) {
                return true;
            }
            $label = ord($data[$offset + 1]);
            if ($label === 0xFE) {
                return true;
            }
            if ($label === 0xFF) {
                $blockSize = ord($data[$offset + 2] ?? "\x00");
                $identifier = $blockSize >= 11 ? substr($data, $offset + 3, 11) : '';
                if ($identifier !== 'NETSCAPE2.0' && $identifier !== 'ANIMEXTS1.0') {
                    return true;
                }
            }
            $offset += 2;
            while ($offset < $length) {
                $blockLen = ord($data[$offset]);
                $offset++;
                if ($blockLen === 0) {
                    break;
                }
                $offset += $blockLen;
                if ($offset > $length) {
                    return true;
                }
            }
            continue;
        }
        if ($byte === 0x2C) {
            if ($offset + 10 > $length) {
                return true;
            }
            $packedField = ord($data[$offset + 9]);
            $offset += 10;
            if ($packedField & 0x80) {
                $offset += 3 * (2 ** (($packedField & 0x07) + 1));
                if ($offset > $length) {
                    return true;
                }
            }
            if ($offset >= $length) {
                return true;
            }
            $offset++;
            while ($offset < $length) {
                $blockLen = ord($data[$offset]);
                $offset++;
                if ($blockLen === 0) {
                    break;
                }
                $offset += $blockLen;
                if ($offset > $length) {
                    return true;
                }
            }
            continue;
        }
        return true;
    }

    return true;
}

function lc_upload_webp_contains_metadata($filePath)
{
    $data = @file_get_contents($filePath);
    if ($data === false || strlen($data) < 12 || substr($data, 0, 4) !== 'RIFF' || substr($data, 8, 4) !== 'WEBP') {
        return true;
    }

    $length = strlen($data);
    $offset = 12;
    while ($offset + 8 <= $length) {
        $chunkType = substr($data, $offset, 4);
        $chunkLength = unpack('V', substr($data, $offset + 4, 4))[1];
        $paddedLength = $chunkLength + ($chunkLength % 2);
        if ($offset + 8 + $paddedLength > $length) {
            return true;
        }
        if (in_array($chunkType, ['EXIF', 'XMP ', 'ICCP'], true)) {
            return true;
        }
        $offset += 8 + $paddedLength;
    }

    return false;
}

function lc_upload_file_contains_metadata($filePath, $mimeType)
{
    switch ($mimeType) {
        case 'image/jpeg':
            return lc_upload_jpeg_contains_metadata($filePath);
        case 'image/png':
            return lc_upload_png_contains_metadata($filePath);
        case 'image/gif':
            return lc_upload_gif_contains_metadata($filePath);
        case 'image/webp':
            return lc_upload_webp_contains_metadata($filePath);
        default:
            return true;
    }
}

function lc_upload_write_imagick_image($imagick, $destinationPath, $mimeType)
{
    switch ($mimeType) {
        case 'image/jpeg':
            $imagick->setImageFormat('jpeg');
            $imagick->setImageCompressionQuality(92);
            break;
        case 'image/png':
            $imagick->setImageFormat('png');
            $imagick->setOption('png:compression-level', '6');
            break;
        case 'image/gif':
            $imagick->setImageFormat('gif');
            break;
        case 'image/webp':
            $imagick->setImageFormat('webp');
            $imagick->setImageCompressionQuality(85);
            break;
    }

    if ($mimeType === 'image/gif' && method_exists($imagick, 'writeImages')) {
        return $imagick->writeImages($destinationPath, true);
    }

    return $imagick->writeImage($destinationPath);
}

function lc_upload_clear_imagick_metadata($imagick, $mimeType)
{
    if ($mimeType === 'image/jpeg' && method_exists($imagick, 'autoOrient')) {
        $imagick->autoOrient();
    }

    $imagick->stripImage();
    if (method_exists($imagick, 'profileImage')) {
        try {
            $imagick->profileImage('*', null);
        } catch (Exception $exception) {
        }
    }

    $properties = [
        'exif:*',
        'iptc:*',
        'xmp:*',
        'photoshop:*',
        'comment',
        'label',
    ];
    foreach ($properties as $property) {
        try {
            $imagick->setImageProperty($property, '');
        } catch (Exception $exception) {
        }
    }

    if (method_exists($imagick, 'setImageOrientation')) {
        try {
            $imagick->setImageOrientation(Imagick::ORIENTATION_TOPLEFT);
        } catch (Exception $exception) {
        }
    }
}

function lc_upload_strip_image_metadata_imagick($sourcePath, $destinationPath, $mimeType)
{
    if (!class_exists('Imagick')) {
        return false;
    }

    try {
        $imagick = new Imagick();
        $imagick->readImage($sourcePath);
        $isGif = $mimeType === 'image/gif';
        if ($isGif && method_exists($imagick, 'coalesceImages')) {
            $imagick = $imagick->coalesceImages();
        }

        foreach ($imagick as $frame) {
            lc_upload_clear_imagick_metadata($frame, $mimeType);
        }

        $result = lc_upload_write_imagick_image($imagick, $destinationPath, $mimeType);
        $imagick->clear();
        $imagick->destroy();
        return (bool) $result;
    } catch (Exception $exception) {
        return false;
    }
}

function lc_upload_strip_image_metadata_gd($sourcePath, $destinationPath, $mimeType)
{
    if (!extension_loaded('gd')) {
        return false;
    }

    switch ($mimeType) {
        case 'image/jpeg':
            if (!function_exists('imagecreatefromjpeg')) {
                return false;
            }
            $source = @imagecreatefromjpeg($sourcePath);
            break;
        case 'image/png':
            if (!function_exists('imagecreatefrompng')) {
                return false;
            }
            $source = @imagecreatefrompng($sourcePath);
            break;
        case 'image/gif':
            if (!function_exists('imagecreatefromgif')) {
                return false;
            }
            $source = @imagecreatefromgif($sourcePath);
            break;
        case 'image/webp':
            if (!function_exists('imagecreatefromwebp')) {
                return false;
            }
            $source = @imagecreatefromwebp($sourcePath);
            break;
        default:
            return false;
    }

    if (!$source) {
        return false;
    }

    if ($mimeType === 'image/jpeg') {
        $source = lc_upload_apply_orientation($source, lc_upload_get_jpeg_orientation($sourcePath));
    }

    $copy = lc_upload_create_truecolor_copy($source, $mimeType);
    imagedestroy($source);
    if (!$copy) {
        return false;
    }

    switch ($mimeType) {
        case 'image/jpeg':
            $result = imagejpeg($copy, $destinationPath, 92);
            break;
        case 'image/png':
            $result = imagepng($copy, $destinationPath, 6);
            break;
        case 'image/gif':
            $palette = imagecreatetruecolor(imagesx($copy), imagesy($copy));
            if ($palette) {
                imagealphablending($palette, false);
                imagesavealpha($palette, true);
                $transparent = imagecolorallocatealpha($palette, 0, 0, 0, 127);
                imagefilledrectangle($palette, 0, 0, imagesx($copy), imagesy($copy), $transparent);
                imagecopy($palette, $copy, 0, 0, 0, 0, imagesx($copy), imagesy($copy));
                imagetruecolortopalette($palette, true, 256);
                $result = imagegif($palette, $destinationPath);
                imagedestroy($palette);
            } else {
                $result = imagegif($copy, $destinationPath);
            }
            break;
        case 'image/webp':
            $result = imagewebp($copy, $destinationPath, 85);
            break;
        default:
            $result = false;
            break;
    }

    imagedestroy($copy);
    return (bool) $result;
}

function lc_upload_process_image_without_metadata($sourcePath, $destinationPath, $mimeType)
{
    if (lc_upload_strip_image_metadata_imagick($sourcePath, $destinationPath, $mimeType)
        && !lc_upload_file_contains_metadata($destinationPath, $mimeType)) {
        return true;
    }

    return lc_upload_strip_image_metadata_gd($sourcePath, $destinationPath, $mimeType)
        && !lc_upload_file_contains_metadata($destinationPath, $mimeType);
}

function strip_mp4_metadata($filePath)
{
    $data = @file_get_contents($filePath);
    if ($data === false) {
        return false;
    }

    $modified = false;
    $offset = 0;
    $length = strlen($data);

    while ($offset + 8 <= $length) {
        $boxSize = unpack('N', substr($data, $offset, 4))[1];
        $boxType = substr($data, $offset + 4, 4);
        if ($boxSize < 8) {
            break;
        }
        if ($boxType === 'udta') {
            $emptyBox = pack('N', 8) . 'free';
            $data = substr($data, 0, $offset) . $emptyBox . str_repeat("\x00", $boxSize - 8) . substr($data, $offset + $boxSize);
            $modified = true;
        }
        if ($boxType === 'moov') {
            $innerOffset = $offset + 8;
            $innerEnd = $offset + $boxSize;
            while ($innerOffset + 8 <= $innerEnd) {
                $innerSize = unpack('N', substr($data, $innerOffset, 4))[1];
                $innerType = substr($data, $innerOffset + 4, 4);
                if ($innerSize < 8) {
                    break;
                }
                if ($innerType === 'udta') {
                    $emptyBox = pack('N', 8) . 'free';
                    $data = substr($data, 0, $innerOffset) . $emptyBox . str_repeat("\x00", $innerSize - 8) . substr($data, $innerOffset + $innerSize);
                    $modified = true;
                }
                $innerOffset += $innerSize;
            }
        }
        $offset += $boxSize;
    }

    if ($modified) {
        return (bool) @file_put_contents($filePath, $data);
    }
    return false;
}

$maxBytes = defined('MAX_UPLOAD_BYTES') ? MAX_UPLOAD_BYTES : (100 * 1024 * 1024);
if (lc_upload_request_too_large($maxBytes)) {
    http_response_code(413);
    echo json_encode(['error' => lc_get_upload_limit_label($maxBytes)]);
    exit;
}

if (!isset($_FILES['file'])) {
    echo json_encode(['success' => false, 'message' => 'No file uploaded or upload error']);
    exit;
}

if (lc_is_upload_error_too_large($_FILES['file']['error'])) {
    http_response_code(413);
    echo json_encode(['error' => lc_get_upload_limit_label($maxBytes)]);
    exit;
}

if ($_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['success' => false, 'message' => 'No file uploaded or upload error']);
    exit;
}

$fileType = isset($_POST['file_type']) ? $_POST['file_type'] : 'file';
$originalName = isset($_FILES['file']['name']) ? (string) $_FILES['file']['name'] : '';
$safeOriginalName = lc_upload_safe_original_name($originalName);
$normalizedExtension = lc_upload_normalize_extension($safeOriginalName);
$reportedMimeType = isset($_FILES['file']['type']) ? (string) $_FILES['file']['type'] : '';
$detectedMimeType = lc_upload_detect_mime_type($_FILES['file']['tmp_name'], $reportedMimeType);
$mimeType = $detectedMimeType ?: $reportedMimeType;
$cleanMime = strtolower(trim(explode(';', (string) $mimeType)[0]));

// Block dangerous executable extensions completely
$dangerousExtensions = ['php', 'php3', 'php4', 'php5', 'phtml', 'phar', 'shtml', 'asp', 'aspx', 'cgi', 'pl', 'exe', 'sh', 'bat', 'cmd', 'vbs', 'htaccess'];
$rawExt = strtolower(pathinfo($safeOriginalName, PATHINFO_EXTENSION));
if (in_array($rawExt, $dangerousExtensions, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Disallowed file extension']);
    exit;
}

$subDir = 'files';
switch ($fileType) {
    case 'image':
        $uploadDir = IMAGE_UPLOAD_DIR;
        $uploadUrl = IMAGE_UPLOAD_URL;
        $subDir = 'images';
        $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        break;
    case 'voice':
    case 'audio':
        $uploadDir = VOICE_UPLOAD_DIR;
        $uploadUrl = VOICE_UPLOAD_URL;
        $subDir = 'voice';
        $allowedTypes = ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'video/webm', 'application/ogg', 'video/mp4'];
        break;
    case 'video_note':
    case 'video':
        $uploadDir = FILE_UPLOAD_DIR;
        $uploadUrl = FILE_UPLOAD_URL;
        $subDir = 'files';
        $allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/ogg', 'application/mp4'];
        break;
    default:
        $uploadDir = FILE_UPLOAD_DIR;
        $uploadUrl = FILE_UPLOAD_URL;
        $subDir = 'files';
        $allowedTypes = null;
}

if (!file_exists($uploadDir)) {
    @mkdir($uploadDir, 0755, true);
}

$isVoiceAllowed = ($fileType === 'voice' || $fileType === 'audio') && (
    strpos($cleanMime, 'audio/') === 0 ||
    $cleanMime === 'video/webm' ||
    $cleanMime === 'application/ogg' ||
    in_array($normalizedExtension, ['webm', 'ogg', 'mp3', 'wav', 'm4a'], true)
);

$isVideoAllowed = ($fileType === 'video' || $fileType === 'video_note') && (
    strpos($cleanMime, 'video/') === 0 ||
    $cleanMime === 'application/mp4' ||
    in_array($normalizedExtension, ['mp4', 'webm', 'mov', 'mkv'], true)
);

if ($allowedTypes !== null && !in_array($cleanMime, $allowedTypes, true) && !$isVoiceAllowed && !$isVideoAllowed) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid file type (' . $cleanMime . ')']);
    exit;
}

if ($fileType === 'image' && !lc_upload_validate_image_file($_FILES['file']['tmp_name'], $cleanMime, $normalizedExtension)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid file type']);
    exit;
}

if ($_FILES['file']['size'] > $maxBytes) {
    http_response_code(413);
    echo json_encode(['error' => lc_get_upload_limit_label($maxBytes)]);
    exit;
}

$fileName = time() . '_' . md5(uniqid()) . '_' . $safeOriginalName;
$filePath = $uploadDir . $fileName;

$realUploadDir = realpath($uploadDir);
if ($realUploadDir === false) {
    @mkdir($uploadDir, 0755, true);
    $realUploadDir = realpath($uploadDir);
}
if ($realUploadDir === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Upload directory inaccessible']);
    exit;
}

$normalizedRealUploadDir = rtrim(str_replace(['\\', '/'], DIRECTORY_SEPARATOR, $realUploadDir), DIRECTORY_SEPARATOR);
$normalizedFilePath = str_replace(['\\', '/'], DIRECTORY_SEPARATOR, $filePath);

if (strpos($normalizedFilePath, $normalizedRealUploadDir . DIRECTORY_SEPARATOR) !== 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid destination path']);
    exit;
}

$tempStagingPath = $filePath . '.tmp';
$originalFileSize = (int) $_FILES['file']['size'];

if ($fileType === 'image') {
    if (!lc_upload_process_image_without_metadata($_FILES['file']['tmp_name'], $tempStagingPath, $mimeType)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to process image']);
        exit;
    }
} else {
    if (!move_uploaded_file($_FILES['file']['tmp_name'], $tempStagingPath)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to upload file']);
        exit;
    }
    if ($fileType === 'video' && $mimeType === 'video/mp4') {
        strip_mp4_metadata($tempStagingPath);
    }
}

// Server-side at-rest encryption for uploaded files (AES-256-CTR with LENC header)
$encryptedSuccess = Encryption::encryptFile($tempStagingPath, $filePath);
if ($encryptedSuccess) {
    @unlink($tempStagingPath);
} else {
    // If encryption failed, keep staged file
    @rename($tempStagingPath, $filePath);
}

// Generate URL pointing to protected file streaming endpoint
$fileToken = hash_hmac('sha256', $fileName, defined('APP_ENC_KEY') ? APP_ENC_KEY : 'secret');
$fileUrl = 'api/file.php?file=' . rawurlencode($subDir . '/' . $fileName) . '&token=' . $fileToken;

echo json_encode([
    'success' => true,
    'file_url' => $fileUrl,
    'fileUrl' => $fileUrl,
    'file_token' => $fileToken,
    'raw_url' => $uploadUrl . $fileName,
    'file_name' => $fileName,
    'file_size' => $originalFileSize
]);
