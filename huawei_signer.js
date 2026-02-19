const crypto = require('crypto');

// Huawei Cloud HMAC-SHA256 Signing Implementation
class HuaweiCloudSigner {
    static EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    
    // URL encoding (special rules for Huawei Cloud)
    static urlEncode(str) {
        if (typeof str !== 'string') {
            str = String(str);
        }
        
        // Characters that don't need encoding
        const noEscape = new Set([
            ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~',
            // Add more unreserved characters as needed
        ]);
        
        let out = '';
        for (let i = 0; i < str.length; i++) {
            const c = str.charAt(i);
            if (noEscape.has(c)) {
                out += c;
            } else {
                const hex = str.charCodeAt(i).toString(16).toUpperCase().padStart(2, '0');
                out += '%' + hex;
            }
        }
        return out;
    }
    
    // Format datetime as YYYYMMDDTHHmmssZ
    static getDateTime() {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        const hours = String(now.getUTCHours()).padStart(2, '0');
        const minutes = String(now.getUTCMinutes()).padStart(2, '0');
        const seconds = String(now.getUTCSeconds()).padStart(2, '0');
        return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
    }
    
    // Build canonical URI (URL path)
    static buildCanonicalURI(path) {
        if (!path) {
            return '/';
        }
        
        // Split and encode each segment
        const segments = path.split('/');
        const encodedSegments = segments.map(seg => this.urlEncode(seg));
        let uri = encodedSegments.join('/');
        
        // Ensure ends with /
        if (uri[uri.length - 1] !== '/') {
            uri += '/';
        }
        
        return uri;
    }
    
    // Build canonical query string
    static buildCanonicalQueryString(params) {
        const keys = Object.keys(params).sort();
        const pairs = [];
        
        for (const key of keys) {
            const encodedKey = this.urlEncode(key);
            const value = params[key];
            
            if (Array.isArray(value)) {
                const sortedValues = value.sort();
                for (const v of sortedValues) {
                    pairs.push(`${encodedKey}=${this.urlEncode(v)}`);
                }
            } else {
                pairs.push(`${encodedKey}=${this.urlEncode(value)}`);
            }
        }
        
        return pairs.join('&');
    }
    
    // Build canonical headers
    static buildCanonicalHeaders(headers) {
        const sortedKeys = Object.keys(headers).sort((a, b) => 
            a.toLowerCase().localeCompare(b.toLowerCase())
        );
        
        const headerStrs = sortedKeys.map(key => {
            const lowerKey = key.toLowerCase();
            const value = headers[key];
            // Trim and remove extra whitespace
            const trimmedValue = String(value).trim();
            return `${lowerKey}:${trimmedValue}\n`;
        });
        
        return headerStrs.join('');
    }
    
    // Build signed headers string
    static buildSignedHeaders(headers) {
        const sortedKeys = Object.keys(headers).sort((a, b) => 
            a.toLowerCase().localeCompare(b.toLowerCase())
        );
        return sortedKeys.map(k => k.toLowerCase()).join(';');
    }
    
    // Calculate SHA256 hash of payload
    static hashPayload(data) {
        if (!data || data === '') {
            return this.EMPTY_BODY_SHA256;
        }
        
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        return crypto.createHash('sha256').update(str).digest('hex');
    }
    
    // Build canonical request string
    static buildCanonicalRequest(method, uri, queryString, canonicalHeaders, signedHeaders, payloadHash) {
        const parts = [
            method.toUpperCase(),
            uri,
            queryString,
            canonicalHeaders,
            signedHeaders,
            payloadHash
        ];
        return parts.join('\n');
    }
    
    // Calculate hex hash of a string
    static hexHash(str) {
        return crypto.createHash('sha256').update(str).digest('hex');
    }
    
    // Calculate HMAC-SHA256 signature
    static hmacSHA256(secret, str) {
        return crypto.createHmac('sha256', secret).update(str).digest('hex');
    }
    
    // Sign a request
    static signRequest(options, ak, sk) {
        const method = options.method || 'GET';
        const url = new URL(options.url);
        const path = url.pathname;
        const host = url.host;
        
        // Check if this is an OBS request (OBS uses obs.<region>.myhuaweicloud.com)
        const isOBS = host.includes('.obs.') || host.startsWith('obs.');
        
        if (isOBS) {
            return this.signOBSRequest(options, ak, sk);
        }
        
        // Build headers to sign
        const headersToSign = {
            'host': host,
            'content-type': options.headers['content-type'] || 'application/json'
        };
        
        // Add custom headers
        if (options.headers['x-project-id']) {
            headersToSign['x-project-id'] = options.headers['x-project-id'];
        }
        
        // Get datetime
        const dateTime = this.getDateTime();
        headersToSign['x-sdk-date'] = dateTime;
        
        // Build canonical components
        const canonicalURI = this.buildCanonicalURI(path);
        const canonicalQueryString = this.buildCanonicalQueryString(options.params || {});
        const canonicalHeaders = this.buildCanonicalHeaders(headersToSign);
        const signedHeaders = this.buildSignedHeaders(headersToSign);
        const payloadHash = this.hashPayload(options.data);
        
        // Build canonical request
        const canonicalRequest = this.buildCanonicalRequest(
            method,
            canonicalURI,
            canonicalQueryString,
            canonicalHeaders,
            signedHeaders,
            payloadHash
        );
        
        console.log('Canonical Request:', JSON.stringify(canonicalRequest));
        
        // Hash canonical request
        const canonicalRequestHash = this.hexHash(canonicalRequest);
        
        // Build string to sign
        const stringToSign = `SDK-HMAC-SHA256\n${dateTime}\n${canonicalRequestHash}`;
        
        console.log('String to sign:', JSON.stringify(stringToSign));
        
        // Calculate signature
        const signature = this.hmacSHA256(sk, stringToSign);
        
        console.log('Signature:', signature);
        
        // Build authorization header
        const authHeader = `SDK-HMAC-SHA256 Access=${ak}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
        
        console.log('Authorization:', authHeader);
        
        // Return all headers
        return {
            ...headersToSign,
            'Authorization': authHeader
        };
    }
    
    // Sign an OBS request (OBS uses different signing method)
    static signOBSRequest(options, ak, sk) {
        const method = options.method || 'GET';
        const url = new URL(options.url);
        const path = url.pathname;
        const host = url.host;
        
        const contentType = options.headers['content-type'] || 'application/octet-stream';
        
        // Get date in OBS format (RFC 7231)
        const now = new Date();
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dateStr = `${days[now.getUTCDay()]}, ${String(now.getUTCDate()).padStart(2, '0')} ${months[now.getUTCMonth()]} ${now.getUTCFullYear()} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')} GMT`;
        
        // Build canonical resource (for OBS, it's just the path)
        const canonicalResource = path.endsWith('/') ? path : path + '/';
        
        // Build string to sign for OBS
        // StringToSign = HTTP-Verb + "\n" + Content-MD5 + "\n" + Content-Type + "\n" + Date + "\n" + CanonicalizedResource
        const stringToSign = `${method}\n\n${contentType}\n${dateStr}\n${canonicalResource}`;
        
        console.log('OBS String to Sign:', JSON.stringify(stringToSign));
        
        // Calculate HMAC-SHA1 signature (OBS uses SHA1, not SHA256)
        const signature = crypto.createHmac('sha1', sk).update(stringToSign).digest('base64');
        
        console.log('OBS Signature:', signature);
        
        // Build authorization header (OBS format)
        const authHeader = `OBS ${ak}:${signature}`;
        
        console.log('OBS Authorization:', authHeader);
        
        // Return headers
        return {
            'Host': host,
            'Content-Type': contentType,
            'Date': dateStr,
            'Authorization': authHeader
        };
    }
}

// Export
module.exports = HuaweiCloudSigner;
