(function (global) {
  const endpointMap = {
    main: 'api/main.php',
    upload: 'api/upload.php',
    sync: 'api/sync.php',
  };

  function normalizeParams(params) {
    if (!params || typeof params !== 'object') {
      return {};
    }
    return params;
  }

  function buildQuery(action, params) {
    const query = new URLSearchParams();
    if (action) {
      if (typeof action === 'string') {
        const rawAction = action.startsWith('?') ? action.slice(1) : action;
        const [actPart, ...queryParts] = rawAction.split('&');
        if (actPart) {
          query.set('action', actPart);
        }
        if (queryParts.length > 0) {
          queryParts.forEach((part) => {
            if (!part) return;
            const eqIdx = part.indexOf('=');
            if (eqIdx !== -1) {
              const k = decodeURIComponent(part.slice(0, eqIdx));
              const v = decodeURIComponent(part.slice(eqIdx + 1));
              query.set(k, v);
            } else {
              query.set(decodeURIComponent(part), '');
            }
          });
        }
      } else {
        query.set('action', action);
      }
    }
    const values = normalizeParams(params);
    Object.keys(values).forEach((key) => {
      const value = values[key];
      if (value === undefined || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => query.append(key, item));
        return;
      }
      query.set(key, value);
    });
    const encoded = query.toString();
    return encoded ? `?${encoded}` : '';
  }

  function buildUrl(action, params, target) {
    const endpoint = endpointMap[target || 'main'] || endpointMap.main;
    return `${endpoint}${buildQuery(action, params)}`;
  }

  function request(action, init, params, target) {
    return global.fetch(buildUrl(action, params, target), init);
  }

  global.ApiClient = {
    endpoint(target) {
      return endpointMap[target || 'main'] || endpointMap.main;
    },
    url(action, params, target) {
      return buildUrl(action, params, target);
    },
    fetch(action, init, params, target) {
      return request(action, init, params, target);
    },
    syncUrl(action, params) {
      return buildUrl(action, params, 'sync');
    },
    uploadUrl(params) {
      return buildUrl('upload', params, 'upload');
    },
  };
})(typeof self !== 'undefined' ? self : window);
