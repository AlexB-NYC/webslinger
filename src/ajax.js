import Dataman from './dataman.js';
import { create_logger, describe_url } from './logger.js';

const logger = create_logger('Ajax');

class Ajax{

    constructor(session_token='anonymous'){
        this.session_token = session_token;
        this.dataman = new Dataman();

        this.ipfs_gateway = 'https://gateway.ipfs-upload.com/ipfs/';
    };


    _form_encode = (data, use_session_token=true) => {
        var query = [];

        if (typeof data === 'string') {
            if (data) { query.push(data); }
        } else if (typeof URLSearchParams !== 'undefined' && data instanceof URLSearchParams) {
            for (const [key, value] of data.entries()) {
                if (use_session_token && key === 'session_token') { continue; }
                query.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
            }
        } else if (data != null) {
            for (var key in data) {
                if (use_session_token && key === 'session_token') { continue; }
                query.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key]));
            }
        }

        if (use_session_token) {
            query.push('session_token=' + encodeURIComponent(this.session_token));
        }

        return query.join('&');
    }

    _append_query_param = (url, key, value) => {
        const string_url = String(url);
        const hash_index = string_url.indexOf('#');
        const hash = hash_index === -1 ? '' : string_url.slice(hash_index);
        const base_url = hash_index === -1 ? string_url : string_url.slice(0, hash_index);
        const separator = base_url.includes('?')
            ? (base_url.endsWith('?') || base_url.endsWith('&') ? '' : '&')
            : '?';

        return `${base_url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash}`;
    }

    async go(url, data={}, method='POST', request_options={}) {
        const {
            form_encode = true,
            use_session_token = true,
        } = request_options ?? {};
        const request_method = String(method).toUpperCase();
        const has_body = request_method !== 'GET' && request_method !== 'HEAD';
        let request_url = url;

        const fetch_options = {
            method: request_method,
            credentials: 'same-origin'
        };

        if (has_body) {
            if (form_encode) {
                fetch_options.headers = {
                    'Content-type': 'application/x-www-form-urlencoded'
                };
                fetch_options.body = this._form_encode(data, use_session_token);
            } else {
                fetch_options.body = data;
            }
        }

        if (use_session_token && (!has_body || !form_encode)) {
            request_url = this._append_query_param(request_url, 'session_token', this.session_token);
        }

        logger.debug('Request started', {
            method: request_method,
            url: describe_url(request_url),
            has_body,
            form_encode,
            use_session_token,
        });
        const response = await fetch(request_url, fetch_options);

        if (!response.ok) {
            const error_text = await response.text();
            logger.warn('Request failed', {
                method: request_method,
                url: describe_url(request_url),
                status: response.status,
                response_size: error_text.length,
            });
            throw new Error(`HTTP error! status: ${response.status} | response: ${error_text}`);
        }

        logger.debug('Request completed', {
            method: request_method,
            url: describe_url(request_url),
            status: response.status,
        });
        return await response.text();
    }

    async head(url, request_options={}){
        return (this.go(url,{},'HEAD',request_options));
    }

    async blob(url, blob) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream'
            },
            body: blob
          });

          if (!response.ok) {
            // Try to read response text for more details.
            const errorText = await response.text();
            // You could also include headers if needed:
            const errorHeaders = JSON.stringify([...response.headers]);
            throw new Error(`HTTP error! status: ${response.status}\nResponse Text: ${errorText}\nHeaders: ${errorHeaders}`);
          }

          // Try to parse as JSON and return.
          return await response.json();
        } catch (error) {
          logger.error('Blob upload failed', {
            url: describe_url(url),
            blob_size: blob?.size ?? null,
            error,
          });
          throw error;
        }
      }



    async json(url, data={}, request_options={}){
        const result = await this.go(url, data, 'POST', request_options);
        try{
            return JSON.parse(result);
        } catch (err){
            return result;
        }

    }

    ipfs = async (ipfs_hash) => {
        const url = `${this.ipfs_gateway}${ipfs_hash}`;
        try{
            const response = await fetch(url);

            const content_type = response.headers.get("content-type");

            switch (content_type.toLowerCase()){
                case 'application/json; charset=utf-8':
                case 'text/html; charset=utf-8':
                case 'application/json':
                return response.json(); // get JSON from the response
                break;


                default:
                return response.blob();
                break;
            }
        } catch (error){
            logger.error('IPFS fetch failed', {
                gateway: describe_url(this.ipfs_gateway),
                hash_length: String(ipfs_hash ?? '').length,
                error,
            });
        }

    }

    async post(url, data, request_options={}){
        return await this.json(url, data, request_options);
    }

    async form(url,formData){
        const self = this;
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState == 4) {
                logger.debug('Form request completed', {
                    url: describe_url(url),
                    status: xhr.status,
                    response_size: xhr.responseText?.length ?? 0,
                });
                result = self.parseJSON(xhr.responseText);
                return result;
            }
        };
        xhr.open('POST', url, true);
        xhr.send(formData);
    }

}

export default Ajax;
