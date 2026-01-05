/*! webslinger v0.1.0 | 2026-01-05 | MIT License */
(function(global){
'use strict';

/* --- src/dataman.js --- */
class Dataman {
    constructor(){
        this.gen = {
            token:this.token
        }  

        this.parse = {
            json:this.parse_json
        }
        
    };

    parse_json(str){
        try{
            return JSON.parse(str);
        } catch (err){
            return str;
        }
    }

    b64_decode = (str)=>{
      console.log(str);
      return new TextDecoder().decode(Uint8Array.from(atob(str), c => c.charCodeAt(0)));
    }
    
    b64_encode = (str)=>{
      return btoa(new TextDecoder('utf-8').decode(new TextEncoder().encode(str)));
    }


    crc32(r){
        for(var a,o=[],c=0;c<256;c++){a=c;for(var f=0;f<8;f++)a=1&a?3988292384^a>>>1:a>>>1;o[c]=a}for(var n=-1,t=0;t<r.length;t++)n=n>>>8^o[255&(n^r.charCodeAt(t))];return((-1^n)>>>0).toString(16)
    }

    jsonify = (form)=> {
        if (typeof form === "string"){
          console.log("CSS SELECTOR");
         }
        const obj = {};
        const others = Array();
        const dynamic_add = Array();
        const elements = form.querySelectorAll( "input, select, textarea" );
        for( var i = 0; i < elements.length; ++i ) {
          const element = elements[i];
          const name = element.name;
          const value = element.value;
          if (name !==''){
            if (element.type == 'checkbox'){
                obj[name] = element.checked;
            } else if (element.type == 'radio'){
                if (element.checked){
                  obj[name] = element.value;
                }
            } else if (element.type == ('select-multiple')){
              obj[name] = JSON.stringify(self.getSelectValues(element));
            } else if (element.classList.contains('dynamic_add')){
              // console.log(element);
              dynamic_add.push(element.value);
            } else {
              if( name ) {
                if (value != ""){obj[ name ] = value;}
              }
            }
          }
        }
        return obj;
    }

    sha256 = async (message)=>{
        // encode as UTF-8
        const msgBuffer = new TextEncoder().encode(message);                    
    
        // hash the message
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    
        // convert ArrayBuffer to Array
        const hashArray = Array.from(new Uint8Array(hashBuffer));
    
        // convert bytes to hex string                  
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    token(){        
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);          
    }

    obj_blob(obj) {
      const jsonString = JSON.stringify(obj);
      console.log(jsonString);
      const blob = new Blob([jsonString], { type: 'application/json' }); 
      return blob;
  }

}
Dataman;

/* --- src/ajax.js --- */
class Ajax{
  
    constructor(session_token='anonymous'){
        this.session_token = session_token;
        this.dataman = new Dataman();

        this.ipfs_gateway = 'https://gateway.ipfs-upload.com/ipfs/';
    };

    
    async go(url, data, method='POST') {
        const options = {
            method: method,
            headers: {
                'Content-type': 'application/x-www-form-urlencoded'
            },
            credentials: 'same-origin'
        };
    
        if (method !== 'GET') {
            options.body = data;
        }
        // console.log({url,options});
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const error_text = await response.text();
            throw new Error(`HTTP error! status: ${response.status} | response: ${error_text}`);
        }
    
        return await response.text();
    }
    
    async head(url){       
        return (this.go(url,{},'HEAD'));                         
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
          console.error('Error in blob():', error);
          throw error;
        }
      }
      


    async json(url,data={}){
        data.session_token = this.session_token;        
        var query = [];
        for (var key in data) {
            query.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key]));
        }
        
        const result = await this.go(url,query.join('&'));  
        try{
            return JSON.parse(result);
        } catch (err){
            return result;
        }      
        
    }

    ipfs = async (ipfs_hash) => {
        try{
            const url = `${this.ipfs_gateway}${ipfs_hash}`;
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
            console.log('JSON FETCH ERROR', error, url);
        }
        
    }

    async post(url,data){
        return await this.json(url,data);       
    }

    async form(url,formData){        
        const self = this;
        var xhr = new XMLHttpRequest();          
        xhr.onreadystatechange = function () {
            if (xhr.readyState == 4) {
                console.log('form resp',xhr.responseText);
                result = self.parseJSON(xhr.responseText);
                return result; 
            }
        };
        xhr.open('POST', url, true);
        xhr.send(formData);                  
    }        
    
}
Ajax;

/* --- src/template.js --- */
function Template(str) {
    const stringObj = new String(str);
    return new Proxy(stringObj, {
      get(target, prop) {
        if (prop === 'interpolate') {
          return function(params, template, identifiers = []) {
            try {
              let parser = new DOMParser();
              let doc = parser.parseFromString(target, 'text/html');
  
              let elements = doc.querySelectorAll('[data-access]');
              elements.forEach(element => {
                let access = element.getAttribute('data-access');
                if (!identifiers.includes(access)) {
                  element.parentNode.removeChild(element);
                }
              });
  
              let serializer = new XMLSerializer();
              let preInterpolatedString = serializer.serializeToString(doc);
  
              preInterpolatedString = preInterpolatedString.replace(/<!DOCTYPE html>.*<body>/, '');
              preInterpolatedString = preInterpolatedString.replace(/<\/body>.*<\/html>/, '');
  
              const names = Object.keys(params);
              const vals = Object.values(params);
  
              const parsed_template = new Function(...names, `return \`${preInterpolatedString}\`;`)(...vals);
              return parsed_template;
            } catch (error) {
              window.console.log('INTERPOLATION ERROR', error);
            }
          };
        }
  
        if (typeof target[prop] === 'function') {
          return target[prop].bind(target);
        }
  
        return target[prop];
      },
    });
  }

/* --- src/cipher.js --- */
//cipher.js - NEW PLATFORM
let self;

class Cipher {
  constructor() {
    this.blind_salt = "6Hz344tz7MHsCJ7uajdiJQ==";
    this.blind_iv = "/ZHFzyvlrcHbl9xnk06LWA==";
  }
  

  getEntropy(callback) {
      const crypto = window.crypto || window.mscrypto;
      let finals = new Uint32Array(8);
      self.counter = null;
      finals = self.csprng_entropy(finals, crypto);
      finals = self.timing_entropy(finals, crypto);
      finals = self.mouse_entropy(finals, crypto, callback);
      console.log('HEX', this.hex);
  }

  csprng_entropy(buf, crypto) {
    let csprng = new Uint32Array(8);
    crypto.getRandomValues(csprng);
    for (let i = 0; i < 8; i++) {
      buf[i] = csprng[i];
    }
    return buf;
  }

  timing_entropy(buf, crypto) {
    let timings = new Uint32Array(256);

    for (let i = 0; i < 256; i++) {
      let start_a = performance.now();
      let j = 0, a = 0;
      while (performance.now() === start_a) {
        a = Math.sin(a + i + j);
        j++;
      }
      timings[i] = j;
    }

    crypto.subtle.digest('SHA-256', timings).then(function(hash) {
      const results = new Uint32Array(hash);
      for (let i = 0; i < results.length; i++) {
        buf[i] ^= results[i];
      }
    }).catch(function(e) {
      console.error(e);
    });
    return buf;
  }

  mouse_entropy(buf, crypto, callback) {
    let coords = new Uint32Array(256);

    let mouseEntropy = function(e) {
      self.counter = self.counter || 0;
      this.lastInputTime = this.lastInputTime || new Date().getTime();
      var percent = Math.ceil((self.counter / 255) * 100);

      if (percent > 100) {
        percent = 100;
      }

      if (document.getElementById('entropy_progress_bar')) {
        document.getElementById('entropy_progress_bar').style.width = percent + '%';
        document.getElementById('entropy_progress_bar').textContent = percent + '%';
      }

      if (self.counter > 255) {
        self.counter = 0;
        window.removeEventListener('mousemove', mouseEntropy);
        window.removeEventListener('touchmove', mouseEntropy);

        crypto.subtle.digest('SHA-256', coords).then(function(hash) {
          const results = new Uint32Array(hash);
          for (let i = 0; i < results.length; i++) {
            buf[i] ^= results[i];
          }
        }).catch(function(e) {
          console.error(e);
        });

        let hex = '';

        for (let i = 0; i < buf.length; i++) {
          hex += ('00000000' + (Number(buf[i]).toString(16))).slice(-8);
        }

        // self./commitEntropy(hex);
        this.hex = hex;
        console.log('HEX?', this.hex);
        callback(hex);
      } else {
        coords[self.counter] = window.screen.width * e.y + e.x;
        var timeStamp = new Date().getTime();
        if ((timeStamp - this.lastInputTime) > 20) {
          self.counter++;
          this.lastInputTime = new Date().getTime();
        }
      }
    };
    window.addEventListener('mousemove', mouseEntropy);
    window.addEventListener('touchmove', mouseEntropy);
    return buf;
  }

  async deriveKey(passphrase, salt, keyLength = 256) {
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-CBC", length: keyLength },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async blind_encrypt (data, keystring){    
    const iv = this.base64ToArrayBuffer(this.blind_iv);
    const salt = this.base64ToArrayBuffer(this.blind_salt);
    const key = await this.deriveKey(keystring,salt);
    console.log({iv,salt,key, keystring, data});
    return this.encrypt(data,key,iv);

  }

  async blind_decrypt (ciphertext, keystring){
    const iv = this.base64ToArrayBuffer(this.blind_iv);
    const salt = this.base64ToArrayBuffer(this.blind_salt);
    const key = await this.deriveKey(keystring,salt);
    console.log(ciphertext,keystring,iv,salt,key);
    return this.decrypt(ciphertext,key,iv);
  }

  async encrypt(data, key, iv) {
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: "AES-CBC",
        iv: iv,
      },
      key,
      new TextEncoder().encode(data)
    );

    return encrypted;
  }

  
  async decrypt(ciphertext, key, iv) {
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-CBC",
        iv: iv,
      },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  }

  arrayBufferToBase64 =(buffer)=>{
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  base64ToArrayBuffer = (base64)=>{
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  base64ToBlob(base64, contentType = '', sliceSize = 512) {
    console.log('***decoding***', base64);
    const byteCharacters = atob(base64);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);

        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }

    const blob = new Blob(byteArrays, {type: contentType});
    return blob;
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
  }



  async stringToArrayBuffer(inputString) {
    const encoder = new TextEncoder();
    const data = encoder.encode(inputString);
    
    // Use a cryptographic hash function like SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Truncate the hash to 16 bytes
    const truncatedHashBuffer = hashBuffer.slice(0, 16);
    
    // Convert the truncated hash buffer to Uint8Array
    const arrayBuffer = new Uint8Array(truncatedHashBuffer);
    
    return arrayBuffer;
  }

  // function base64ToUint8Array(base64) {
  //     const binaryString = window.atob(base64);
  //     const len = binaryString.length;
  //     const bytes = new Uint8Array(len);
  //     for (let i = 0; i < len; i++) {
  //         bytes[i] = binaryString.charCodeAt(i);
  //     }
  //     return bytes;
  // }

}
Cipher;

/* --- src/quantum.js --- */
class Quantum extends Ajax{
    constructor(session_token, encryption_data=null){
        super(session_token);
        this.active_uploads = {};
        this.finished_uploads = {};
        this.progress_data = {};
        this.progress_hook = null;
        this.encryption_data = encryption_data;
        this.chunk_size = 1000000;
        this.upload_path = '/api/quantum/upload'; 

        this.cipher = new Cipher();

        this.file_types = {
            png:'image/png',
            pdf:'application/pdf',
            jpeg: 'image/jpeg',
            jpg: 'image/jpeg',
            json: 'text/plain'
        }
    };

    async reconstruct(blob, file_token, ext) {
        console.log('reconstruct', blob, file_token);
        // const file_types = await this.json('/modules/utils/file_types');
        // console.log(file_types);
        // this.mime_types = file_types.mime_types;
        
        // Wrap FileReader in a promise
        const readBlobAsText = (blob) => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    resolve(e.target.result);
                };
                reader.onerror = function(e) {
                    reject(e);
                };
                reader.readAsText(blob);
            });
        };
    
        try {
            const blobText = await readBlobAsText(blob);
            // Now that you have the blob content as text
            console.log(blobText);
    
            // Assuming `this.active_uploads` and `this.receive_file` are properly initialized and implemented
            this.active_uploads[file_token] = {
                encrypted: blobText,
                decrypted: '',
                size: blob.size,
                current: 0,
                total: 0,
                ext: ext
            };
            
            const reconstruct = await this.receive_file(file_token);
            console.log(reconstruct);
            
            // Assuming you want to return the result of `receive_file`
            return reconstruct;
        } catch (error) {
            console.error("Error reading blob", error);
            throw error; // Rethrow or handle error as needed
        }
    }

    async receive_file(file_token){ 
        const file = this.active_uploads[file_token];     
        const total_chunks = Math.ceil(file.size / this.chunk_size);
        let current_chunk = 0;
        console.log(file_token,file, total_chunks, current_chunk);
        this.active_uploads[file_token].total = total_chunks;
        file.status = 'uploading';

        while (current_chunk < total_chunks) {            
            let chunk_result = await this.receive_chunk(file_token, current_chunk);
            console.log(chunk_result);
            this.active_uploads[file_token].decrypted += chunk_result;
            current_chunk++;
            this.active_uploads[file_token].current = current_chunk;        
            // this.progress_hook(this.active_uploads);
        }
        const base64 = file.decrypted.substring(file.decrypted.indexOf(',') + 1);
        console.log(base64, file);
        const mime_type = this.file_types[file.ext];
        console.log(mime_type);
        const file_blob = this.cipher.base64ToBlob(base64,mime_type);
        // const file_b64 = await this.cipher.blobToBase64(file_blob);
        // console.log(file_b64);
        // for (let i=1; i<32; i++){
        //     const mime_hex = base64ToHex(file_b64.slice(0,i));  
        //     if(this.mime_types[mime_hex]){
        //         alert('HEX FOUND!', this.mime_types[mime_hex]);
        //     }        
        //     console.log(mime_hex,this.mime_types);
            
        // }
        // debugger;
        //   return ({header_text:'text/plain'});
        console.log(file_blob);
        return file_blob;
        
    }

    async receive_chunk(file_token, current_chunk){
        const file = this.active_uploads[file_token];
        
        const start = current_chunk * this.chunk_size;
        const stop = start + this.chunk_size;
        console.log(this.encryption_data);
        // debugger;
        const new_blob = file.encrypted.slice(start, stop);
        const decrypted_blob = await this.decrypt_chunk(new_blob, this.active_uploads[file_token].type);
        return decrypted_blob;
        // console.log(new_blob,encrypted_blob);
    }

    async decrypt_chunk(blob, mimetype){
        console.log(blob, mimetype);        
        console.log(this.encryption_data);
        const encryptedBuffer = await this.cipher.base64ToArrayBuffer(blob);
        console.log(encryptedBuffer);
        const fileSaltBuffer = await this.cipher.stringToArrayBuffer(this.encryption_data.fileSalt);
        console.log(this.encryption_data.fileSalt, fileSaltBuffer);
        const fileKeyBuffer = await this.cipher.deriveKey(this.encryption_data.priv_key, fileSaltBuffer);
        console.log(fileKeyBuffer);
        const fileIVBuffer = await this.cipher.stringToArrayBuffer(this.encryption_data.fileIV);
        console.log(this.encryption_data.fileIV, fileIVBuffer);
        try {
            const decrypted_data = await this.cipher.decrypt(encryptedBuffer, fileKeyBuffer, fileIVBuffer);
            console.log(decrypted_data);
            return decrypted_data;
        } catch (error) {
            console.log('DECRYPT ERROR', error);
        }
        // console.log(encryptedWithPin);
        
        // const cipherblob = this.cipher.arrayBufferToBase64(encryptedWithPrivKey);
        // console.log(cipherblob);
        
        // return new Blob([cipherblob], {type:mimetype});
    
    }

    async batch(files, path, progress_hook=()=>{}){        
        console.log('init', files, path, progress_hook);
        this.progress_hook = progress_hook;
        this.path = path;
        const upload_results = {};
        for (let file_token in files){
            const file = files[file_token].file;
            console.log(file, file_token);
            this.active_uploads[file_token] = file;
            this.active_uploads[file_token].current = 0;
            this.active_uploads[file_token].total = 0;
            files[file_token].status = 'queued';
            
            this.progress_data = this.progress_hook(this.active_uploads); //GET RID OF AWAIT?????

            const upload_result = await this.send_file(file_token);
            upload_results[file_token] = upload_result;            
        }

        return upload_results;
    }

    async send_file(file_token){
        const file = this.active_uploads[file_token];        
        console.log(file);
        // debugger;

        const total_chunks = Math.ceil(file.size / this.chunk_size);
        let current_chunk = 0;
        console.log(file_token, file, total_chunks, current_chunk);
        this.active_uploads[file_token].total = total_chunks;
        file.status = 'uploading';

        while (current_chunk < total_chunks) {            
            let chunk_result = await this.send_chunk(file_token, current_chunk);
            console.log(chunk_result);
            current_chunk++;
            this.active_uploads[file_token].current = current_chunk;        
            this.progress_hook(this.active_uploads);
        }
        const filename = (this.encryption_data) ? `${file.name}.encrypted` : file.name;
        const directory = file.directory ?? '';
        // const filename = `${file.name}?type="${file.type}"`;
        console.log('FINAL FILENAME....', filename);
        const path = this.path;
        console.log('PATH', path);
        const finalize_url = `${this.upload_path}?action=finish&file_token=${file_token}&session_token=${this.session_token}`;
        const result = await this.json(finalize_url, {filename, directory, path});
        console.log('finalize', result);
        this.active_uploads[file_token].status = 'finished';
        this.progress_hook(this.active_uploads);
        return result;
    }

    async send_chunk(file_token, current_chunk){
        const file = this.active_uploads[file_token];
        const start = current_chunk * this.chunk_size;
        const stop = start + this.chunk_size;
        
        const upload_url = `${this.upload_path}?action=chunk&index=${current_chunk}&file_token=${file_token}&session_token=${this.session_token}&path=${this.path}`;   
        console.log(upload_url);
        // debugger;

        
        const blob = file.slice(start, stop);
        console.log("[Quantum.send_chunk] file_token:", file_token, "chunk:", current_chunk, "chunk size:", blob.size);

        console.log(this.encryption_data);
        if (this.encryption_data){
            const encrypted_blob = await this.encrypt_chunk(blob, this.active_uploads[file_token].type);
            console.log(blob,encrypted_blob);
            // const test_decrypt = await this.reconstruct(encrypted_blob, file_token);
            // console.log(test_decrypt);
            try {
                const result = await this.blob(upload_url, encrypted_blob);            
                return result;
            } catch(error){
                throw error;
            }     
        } else {
            try {
                const result = await this.blob(upload_url, blob);    
                console.log("[Quantum.send_chunk] Server response:", result);
        
                return result;
            } catch(error){
                throw error;
            }     
        }
           
    }

    // async encrypt_key(){
    //     // const pinSaltBuffer = window.crypto.getRandomValues(new Uint8Array(16));
    //     const fileSaltBuffer = await this.cipher.stringToArrayBuffer(this.encryption_data.fileSalt);
    //     console.log(this.encryption_data.fileSalt,fileSaltBuffer);
    //     const fileKeyBuffer = await this.cipher.deriveKey(this.encryption_data.priv_key, fileSaltBuffer);
        
    //     // const pinIvBuffer = window.crypto.getRandomValues(new Uint8Array(16));
    //     const fileIVBuffer = await this.cipher.stringToArrayBuffer(this.encryption_data.fileIV);
    //     console.log(this.encryption_data.fileIV,fileIVBuffer);

       
    //     const encryptedWithPrivKey = await this.cipher.encrypt(b64_blob, fileKeyBuffer, fileIVBuffer);
    //     // console.log(encryptedWithPin);
        
    //     const cipherblob = this.cipher.arrayBufferToBase64(encryptedWithPrivKey);
    //     console.log(cipherblob);
    // }
// Quantum.js  ─ inside class Quantum
async encrypt_chunk(blob, mimetype) {
    /* convert slice → Base-64 data-URI */
    const b64Uri = await this.blobToBase64(blob);          // "data:image/png;base64,AAAA…"

    /* strip the data-URI header so the chunk is *pure* Base-64 text  */
    const comma   = b64Uri.indexOf(',');
    const b64Data = comma !== -1 ? b64Uri.slice(comma + 1) : b64Uri;

    /* key / IV (unchanged) */
    const saltBuf = await this.cipher.stringToArrayBuffer(this.encryption_data.fileSalt);
    const keyBuf  = await this.cipher.deriveKey(this.encryption_data.priv_key, saltBuf);
    const ivBuf   = await this.cipher.stringToArrayBuffer(this.encryption_data.fileIV);

    /* encrypt, Base-64-encode, add newline delimiter */
    const encBuf    = await this.cipher.encrypt(b64Data, keyBuf, ivBuf);
    const encB64    = this.cipher.arrayBufferToBase64(encBuf) + '\n';

    return new Blob([encB64], { type: '' });
}
    // async encrypt_chunk(blob, mimetype){
    //     console.log(blob, mimetype);
    //     const b64_blob = await this.blobToBase64(blob);
    //     console.log(b64_blob);
    //     // const pinSaltBuffer = window.crypto.getRandomValues(new Uint8Array(16));
    //     const fileSaltBuffer = await this.cipher.stringToArrayBuffer(this.encryption_data.fileSalt);
    //     console.log(this.encryption_data.fileSalt,fileSaltBuffer);
    //     const fileKeyBuffer = await this.cipher.deriveKey(this.encryption_data.priv_key, fileSaltBuffer);
        
    //     // const pinIvBuffer = window.crypto.getRandomValues(new Uint8Array(16));
    //     const fileIVBuffer = await this.cipher.stringToArrayBuffer(this.encryption_data.fileIV);
    //     console.log(this.encryption_data.fileIV,fileIVBuffer);
         
    //     // const symkey = Math.random().toString(256).substring(2, 15) + Math.random().toString(256).substring(2, 15);
    //     const encryptedWithPrivKey = await this.cipher.encrypt(b64_blob, fileKeyBuffer, fileIVBuffer);
    //     // console.log(encryptedWithPin);
        
    //     const cipherblob = this.cipher.arrayBufferToBase64(encryptedWithPrivKey);
    //     console.log(cipherblob);


    //     const decrypted_data = await this.cipher.decrypt(encryptedWithPrivKey, fileKeyBuffer, fileIVBuffer);
    //     console.log(decrypted_data);
        
    //     return new Blob([cipherblob], {type:''});
    // }

    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    

    async finalize(file_token){
        const finalize_url = `${this.upload_path}/finish/${file_token}`;
        try {      
            console.log(this.encryption_data);                  
            const filename = (this.encryption_data) ? `${this.active_uploads[file_token].name}.encrypted` : this.active_uploads[file_token].name;       
            const result = await this.json(finalize_url, {filename});    
            console.log(result, this.active_uploads);    
            this.active_uploads[file_token].status = 'finished';
            this.progress_hook(this.active_uploads);
            return result;    
        } catch (error) {
            console.log(error);
        }
        
    }
}
Quantum;

/* --- src/pin.js --- */
class PINCODE {
    constructor() {
      this.PINS = [];
      this.active = 0;
      this.create = false;

      this.pin_class = 'pin_input';
      this.active_class = 'active_pin';
      this.mobile_pin_id = 'mobile_pin_input';

      this.pin_mask = '●';
      this.pinHandlers = [];

      this.mask = true;
    
      this.html = `<div class="pin_entry_message">Enter pin:</div><div class="pin_row"><div class="${this.pin_class} active_pin"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><input type="number" pattern="\\d\\*" class="mobile_${this.pin_class}" id="mobile_${this.pin_class}"></div>`;
      this.new = `<div class="pin_block"><div class="pin_entry_message">Create pin:</div><div class="pin_row"><div class="${this.pin_class} active_pin"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div></div><div class="pin_block"><div class="pin_entry_message" style="margin-top:15px;">Confirm pin:</div><div class="pin_row"><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><div class="${this.pin_class}"></div><input type="number" pattern="\\d\\*" class="mobile_${this.pin_class}"></div><input type="number" pattern="\\d\\*" class="mobile_${this.pin_class}"></div></div>`;
    }

  
    init(create=false,callback = null) {
        return new Promise((resolve, reject) => {
            this.init_resolve = resolve;
            this.active = 0;
            this.callback = callback;
            this.create = create;

            if (true) {  
                const pin_input = document.getElementsByClassName(`mobile_${this.pin_class}`)[0]; 
                const pins = [...document.getElementsByClassName(this.pin_class)];
                this.pinClickHandler = (pin_box) => {
                    return () => {
                        pin_input.focus();
                    };
                };
                pins.forEach((pin_box) => {
                    const handler = this.pinClickHandler(pin_box);
                    pin_box.onclick = handler;
                    this.pinHandlers.push(handler); // Store reference for later removal
                });

                this.inputHandler = this.mobileInput.bind(this);
                pin_input.addEventListener('input', this.inputHandler);
                this.keydownHandler = this.input.bind(this);
                document.addEventListener('keydown', this.keydownHandler);
            }
        });
    }
    
    async mobileInput(e) {
            let pins = document.getElementsByClassName(this.pin_class);
            let thisPIN;
            const pin_limit = (this.create) ? 11 : 5;
            const value = e.target.value;
            if (value.length > this.active && this.active <= pin_limit) {
                const newChar = value.charAt(this.active);
                thisPIN = pins[this.active];
                thisPIN.classList.remove(this.active_class);
                this.PINS[this.active] = newChar;
                thisPIN.innerHTML = this.pin_mask || newChar.toUpperCase();
                ++this.active;
    
                if (this.active <= pin_limit) {
                    pins[this.active].classList.add(this.active_class);
                } else {
                    // PIN is complete, call submit
                    const pin_action = this.submit();
                    const pin_string = await pin_action(this.callback);
                    this.init_resolve(pin_string);
                }
            } else if (value.length < this.active) {
                this.active = value.length;
                for (let i = 0; i < pins.length; i++) {
                    thisPIN = pins[i];
                    thisPIN.classList.remove(this.active_class);
                    if (i < this.active) {
                        this.PINS[i] = value.charAt(i);
                        thisPIN.innerHTML = this.pin_mask || value.charAt(i).toUpperCase();
                    } else {
                        thisPIN.innerHTML = '';
                    }
                }
                pins[this.active].classList.add(this.active_class);
            }
        }
    
    
    
    reset() {
        const pins = [...document.getElementsByClassName(this.pin_class)];
        pins.forEach((pin_box, index) => {
            pin_box.onclick = null;
        });

        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
        }

        const pin_input = document.getElementsByClassName(`mobile_${this.pin_class}`)[0];
        if (this.inputHandler) {
            pin_input.removeEventListener('input', this.inputHandler);
        }

        this.PINS = [];
        this.active = 0;
        this.disable_inputs();
        
    }

    disable_inputs(disabled=true){
        const inputs = [...document.getElementsByTagName('input')];
        for (const input of inputs){
            console.log(input.type);
            switch(input.type){
                case 'text':
                case 'number':
                    if(input.id !== 'mobile_pin_input'){
                        input.disabled = disabled;
                    }
                    
            }
        }
    }

    
    
  
    async input(e) {
        let pins = document.getElementsByClassName(this.pin_class);
        let thisPIN;
        const pin_limit = (this.create) ? 11 : 5;
        // console.log(e.key);
        switch (e.key) {
            case 'Backspace':
            case 'ArrowLeft':
                if (this.active > pin_limit) {
                    this.active = pin_limit;
                    pins[this.active].classList.add(this.active_class);
                    pins[this.active].innerHTML = '';
                } else if (this.active < 1) {
                    this.active = 0;
                    pins[this.active].classList.add(this.active_class);
                    pins[this.active].innerHTML = '';
                } else {
                    thisPIN = pins[this.active];
                    thisPIN.classList.remove(this.active_class);
                    --this.active;
                    if (pins[this.active]) {
                        thisPIN = pins[this.active];
                        thisPIN.classList.add(this.active_class);
                        thisPIN.innerHTML = '';
                    }
                }
                break;
            case 'Enter':
                
                break;
            default:
                // Place PIN code regex check here
                if (e.key.length === 1 && this.active < (pin_limit + 1)) {
                    thisPIN = pins[this.active];
                    thisPIN.classList.remove(this.active_class);
                    this.PINS[this.active] = e.key;
                    thisPIN.innerHTML = this.pin_mask || e.key.toUpperCase();
                    ++this.active;
                    
                    const pin_action = this.submit();
                    if(this.active > pin_limit){

                        const pin_string = await pin_action(this.callback);
                        this.init_resolve(pin_string);
                    } else { 
                        pins[this.active].classList.add(this.active_class);
                    }
                }
                break;
        }
    }
    
  
    submit() {
        return (async () => {
            const PINCODE = [];
            const pins = this.PINS;
    
            for (let i = 0; i < 6; i++) {
                PINCODE.push(pins[i]);
            }
    
            const pin_string = PINCODE.join('');
            
            // Check if we're in create mode to handle the confirmation PIN
            if (this.create) {
                const CONFIRM_PIN = [];
                for (let i = 6; i < 12; i++) {
                    CONFIRM_PIN.push(pins[i]);
                }
                const confirm_string = CONFIRM_PIN.join('');
                return { pin_code: pin_string, confirm_code: confirm_string };
            } else {
                return pin_string;
            }
        }).bind(this);
    }
    
    
  }
PINCODE;

/* --- src/autocomplete.js --- */
class Autocomplete {
    constructor(haystack, needle, internal = true, threshold = 0,filter=true) {
        this.haystack = haystack;
        this.needle = needle;
        this.internal = internal;
        this.threshold = threshold;
        this.container = null;
        this.displayed = false;
        this.currentIndex = -1;  // Tracks the current active item
    }

    init = (callback=null) => {
        console.log(this);
        this.callback = callback;
        this.needle.addEventListener('input', this.check);
        this.needle.addEventListener('keydown', this.navigate);
        if (this.threshold === 0){
            this.first_check();
        }
    }

    create = () => {
        if (!this.container) {
            const container = document.createElement('div');
            container.className = 'autocomplete_list';
            this.container = container;
            this.needle.insertAdjacentElement('afterend', this.container);
            this.displayed = true;
        }
    }

    first_check = ()=>{
        const value = this.needle.value;
        if (value.length >= this.threshold) {

        console.log({value});

            if (this.displayed) {
                this.container.innerHTML = '';
            } else {
                this.create();
            }
            // const regex = new RegExp('^' + value, 'i'); // Match from the beginning of the string
            // const regex = new RegExp(value, 'i'); // Match from the beginning of the string
            // const filtered_haystack = this.haystack.filter(item => regex.test(item));
            const filtered_haystack = this.haystack.filter(item =>
                item.toLowerCase().includes(value.toLowerCase())
            );
            this.disp(filtered_haystack);

            if (filtered_haystack.length === 1) {
                const suggestion = filtered_haystack[0];
                this.prefill(suggestion, value);
            }
        } else {
            if (this.container) {
                this.container.remove();
                this.container = null;
                this.displayed = false;
            }
        }
    }

    check = (e) => {
        const value = e.target.value;
        if (value.length >= this.threshold) {

        console.log({value});

            if (this.displayed) {
                this.container.innerHTML = '';
            } else {
                this.create();
            }
            // const regex = new RegExp('^' + value, 'i'); // Match from the beginning of the string
            // const regex = new RegExp(value, 'i'); // Match from the beginning of the string
            // const filtered_haystack = this.haystack.filter(item => regex.test(item));
            const filtered_haystack = this.haystack.filter(item =>
                item.toLowerCase().includes(value.toLowerCase())
            );
            this.disp(filtered_haystack);

            if (filtered_haystack.length === 1) {
                const suggestion = filtered_haystack[0];
                this.prefill(suggestion, value);
            }
        } else {
            if (this.container) {
                this.container.remove();
                this.container = null;
                this.displayed = false;
            }
        }
    };

    prefill = (suggestion, value) => {
        const remainingText = suggestion.slice(value.length);
        this.needle.value = value + remainingText;

        // Set cursor position to after the original input text
        this.needle.setSelectionRange(value.length, value.length + remainingText.length);

        // Handle Tab and Delete key events
        this.needle.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                this.clear({});
                this.needle.setSelectionRange(suggestion.length, suggestion.length);
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                this.needle.value = value; // Restore the original input value
                this.needle.setSelectionRange(value.length, value.length);
            }
        }, { once: true }); // Ensure the event listener is only applied once
    };

    disp = (current_haystack) => {
        if (current_haystack.length > 0) {
            if (!this.container) {
                this.create();
            }
            this.container.innerHTML = '';

            current_haystack.forEach((text, index) => {
                const button = document.createElement('button');
                button.textContent = text;
                button.classList = 'autocomplete-item';
                button.addEventListener('click', this.select);
                this.container.appendChild(button);
            });

            // Reset currentIndex when displaying a new list
            this.currentIndex = -1;
        } else {
            if (this.container) {
                this.container.remove();
                this.container = null;
                this.displayed = false;
            }
        }
    }

    navigate = (e) => {
        if (!this.container) return;  // Ensure the container exists

        const items = Array.from(this.container.querySelectorAll('button'));
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.currentIndex = (this.currentIndex + 1) % items.length;  // Wrap around to the top
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.currentIndex = (this.currentIndex - 1 + items.length) % items.length;  // Wrap around to the bottom
        } else if (e.key === 'Enter' && this.currentIndex >= 0) {
            e.preventDefault();
            items[this.currentIndex].click();  // Simulate click on the active item
        }

        // Update the active item
        items.forEach((item, index) => {
            item.classList.toggle('active_item', index === this.currentIndex);
        });
    }

    select = (e) => {
        this.needle.value = e.target.textContent;
        if (this.container) {
            this.container.remove();
            this.container = null;
            this.displayed = false;
        }

        if (this.callback){
            this.callback(this.needle.value);
        }
    }

    clear = (e) => {
        const relatedTarget = e ? e.relatedTarget : null; // The element gaining focus
        if (relatedTarget && this.container && this.container.contains(relatedTarget)) {
            return; // Do nothing if clicking on the autocomplete list
        }

        if (this.container) {
            this.container.remove();
            this.container = null;
            this.displayed = false;
        }
        this.needle.removeEventListener('input', this.check);
    };
}
Autocomplete;

/* --- src/events.js --- */
// /lib/js/events.js
class Events {
  constructor(namespace = "") {
    this.ns = namespace ? String(namespace) : "";
    this._map = new Map();   // event -> Set<fn>
  }

  _key(ev) {
    return this.ns ? `${this.ns}:${ev}` : ev;
  }

  on(event, fn, opts = {}) {
    if (typeof fn !== "function") throw new TypeError("Listener must be a function");
    const key = this._key(event);
    let set = this._map.get(key);
    if (!set) this._map.set(key, (set = new Set()));
    set.add(fn);

    // Optional AbortSignal support
    if (opts.signal instanceof AbortSignal) {
      if (opts.signal.aborted) {
        set.delete(fn);
      } else {
        const abortHandler = () => {
          this.off(event, fn);
          opts.signal.removeEventListener("abort", abortHandler);
        };
        opts.signal.addEventListener("abort", abortHandler, { once: true });
      }
    }
    return () => this.off(event, fn); // unsubscribe function
  }

  once(event, fn) {
    const off = this.on(event, (...args) => {
      try { fn(...args); } finally { off(); }
    });
    return off;
  }

  off(event, fn) {
    const key = this._key(event);
    const set = this._map.get(key);
    if (!set) return false;
    const had = set.delete(fn);
    if (set.size === 0) this._map.delete(key);
    return had;
  }

  clear(event) {
    if (!event) { this._map.clear(); return; }
    const key = this._key(event);
    this._map.delete(key);
  }

  emit(event, ...args) {
    let ok = false;
    const call = (key) => {
      const set = this._map.get(key);
      if (!set || set.size === 0) return;
      // copy to array to avoid mutation during iteration
      [...set].forEach(fn => {
        try { fn(...args); } catch (e) { console.error("Events listener error", { event: key, e }); }
      });
      ok = true;
    };

    // exact listeners
    call(this._key(event));
    // wildcard listeners: "*" receives (event, ...args)
    call(this._key("*")) && [...this._map.get(this._key("*")) || []].forEach(fn => {
      try { fn(event, ...args); } catch (e) { console.error("Events * listener error", e); }
    });

    return ok;
  }

  async emitAsync(event, ...args) {
    const key = this._key(event);
    const set = this._map.get(key);
    if (!set || set.size === 0) return false;
    await Promise.all([...set].map(async fn => {
      try { return await fn(...args); }
      catch (e) { console.error("Events async listener error", { event: key, e }); }
    }));
    return true;
  }

  waitFor(event, { timeout = 0, predicate = null, signal = null } = {}) {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const compositeAbort = (reason) => {
        controller.abort();
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      };

      if (signal instanceof AbortSignal) {
        if (signal.aborted) return compositeAbort("aborted");
        signal.addEventListener("abort", () => compositeAbort("aborted"), { once: true });
      }

      let timer = null;
      if (timeout > 0) {
        timer = setTimeout(() => compositeAbort(new Error("waitFor timeout")), timeout);
      }

      const off = this.on(event, (...args) => {
        try {
          if (predicate && !predicate(...args)) return;
          if (timer) clearTimeout(timer);
          off();
          resolve(args.length <= 1 ? args[0] : args);
        } catch (e) {
          if (timer) clearTimeout(timer);
          off();
          reject(e);
        }
      }, { signal: controller.signal });
    });
  }

  // create a namespaced child emitter that prefixes events
  child(ns) { return new Events(this._key(ns)); }
}

/* --- src/core.js --- */
class Webslinger{    
    constructor(namespace="webslinger"){
        this.template_dir = 'interface';
        this.evt = new Events(namespace);
        this.dataman = new Dataman();
        const session_check = sessionStorage.getItem('session_token');
        this.session_token = session_check || this.dataman.token();

        sessionStorage.setItem('session_token', this.session_token);

        this.ajax = new Ajax(this.session_token);

        this.pre_dialogHTML = `<div id="dialog_container"><div id="dialog_overlay" onclick="window.close_dialog();"></div><div id="dialog_content_container"><div id="dialog_exit" onclick="window.close_dialog();"></div><div id="dialog_content"></div></div></div>`;
        this.dialog_content_id = 'dialog_content';

        this.template_cache = {};

        this.quantum = new Quantum(this.session_token);

        this.cipher = new Cipher();
        
        this.pin = new PINCODE();
        
        //stub until final QR driver decision made
        this.qr = {}

        this.events = this.evt;

        window.addEventListener("dragover", function (e) {
            e = e || event;
            e.preventDefault();
        }, false);

        window.addEventListener("drop", function (e) {
            e = e || event;
            e.preventDefault();
        }, false);

        //JAVASCRIPT IS WEIRD
       queueMicrotask(() => console.log('emitting ready...'),this.evt.emit("ready", { instance: this }));
    };

    interval = {
        active : new Set(),
        make:(...args)=>{
            var newInterval = setInterval(...args);
            this.interval.active.add(newInterval);
            return newInterval;
        },
        clear:(id)=>{
            this.interval.active.delete(id);
            return clearInterval(id);
        },
        clearAll:()=>{
            for (var id of this.interval.active) {
                this.clear(id);
            }
            this.evt.emit("intervals:cleared");
        }
    }
 
    load_external= async (script_list)=>{
        const scripts = Array.isArray(script_list) ? script_list : [script_list];
    
        for (let src of scripts) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.onload = () => {
                    console.log('script loaded - ', src);
                    this.evt.emit("script:loaded", src);
                    resolve();
                };
                script.onerror = (error) => {
                    console.error('script load error - ', src);
                    this.evt.emit("script:error", src, error);
                    reject(error);
                };
                script.src = `${src}?`;
                document.head.appendChild(script);
            });
        }
        console.log('DONE WITH LOOP');
        this.evt.emit("scripts:done", scripts);
        return true;
    }   

    initialized = ()=>{
        return true;
    }

    tokenizer = (str)=>{
        if (str){
            return this.dataman.crc32(str);
        } else {
            return this.dataman.token();
        }
    }

    clipboard =  (str)=>{
        return async (e)=>{
            return navigator.clipboard.writeText(str).then(() => console.log("Copied!", str));
        }
    }

    autocomplete = (haystack, needle, internal, threshold)=>{
        const this_auto = new Autocomplete(haystack, needle, internal, threshold);
        return this_auto;
    }

    gen_qr = (text,size=250)=>{
        const qr_elem = document.createElement('div');
        qr_elem.className = 'qr_div';
        this.qr.render({text, size},qr_elem);
        return qr_elem;
    }

    copy_init = (copy_elem,str)=>{
        if (typeof copy_elem === 'string'){copy_elem = this.get(copy_elem)}
        console.log({copy_elem, str});
        copy_elem.addEventListener('click', ()=>{
                    
            if (navigator.clipboard && navigator.clipboard.writeText) {
                // Modern API
                console.log('copy', str)
                this.clipboard(str)();
                } else {
                // Fallback for Safari/iOS and older browsers
                    const text_area = document.createElement('textarea');
                    text_area.value = str;
                    // Prevent scrolling to bottom
                    text_area.style.position = 'fixed';
                    text_area.style.top = 0;
                    text_area.style.left = 0;
                    text_area.style.width = '1px';
                    text_area.style.height = '1px';
                    text_area.style.padding = 0;
                    text_area.style.border = 'none';
                    text_area.style.outline = 'none';
                    text_area.style.boxShadow = 'none';
                    text_area.style.background = 'transparent';
                    document.body.appendChild(text_area);
                    text_area.focus();
                    text_area.select();
                
                    let success = false;
                    try {
                        success = document.execCommand('copy');
                        console.log('Fallback: Copying text command was', success ? 'successful' : 'unsuccessful');
                    } catch (err) {
                        console.error('Fallback: Oops, unable to copy', err);
                    }
                }
                const copy_msg = document.createElement('div');
                copy_msg.innerHTML = 'Copied!';
                copy_msg.className = 'copy_msg';
                copy_elem.appendChild(copy_msg)
                setTimeout(()=>{
                    this.app.destroy(copy_msg);
                },1500)
        });
                
    }
        
    append (elem, data, context) {
        if (typeof elem == "string") { elem = this.get(elem, context); }
        console.log(elem);
        if (typeof data === "string") {
            elem.insertAdjacentHTML('beforeend', data);
        } else { elem.appendChild(data); }
    }

    insertBefore(elem, data, context) {
        if (typeof elem == "string") { elem = this.get(elem, context); }
        if (elem) {
            elem.insertAdjacentHTML('beforebegin', data);
        }
    }

    destroy = (elem, context)=>{ 
        let str;     
        if (typeof elem === "string"){ str=elem; elem = this.get(elem, context); } 
        if (elem && elem.parentNode && elem.parentNode.classList.contains('elem_container')){        
          this.destroy(elem.parentNode);
        } else if (elem){ 
            console.log(elem, elem.length, elem.tagName);
          if (elem.length && elem.tagName !== 'FORM'){
            
            elem.forEach((thisElem)=>{
              thisElem.parentNode.removeChild(thisElem);
            });
          } else {
            elem.parentNode.removeChild(elem);
          }              
        } else { console.log(`ELEMENT ${str} does not exist`); }
    }

    empty = (elem, context)=>{
        if (typeof elem === "string"){ elem = this.get(elem, context); }
        if (elem){elem.innerHTML = "";}
    }

    dialog = async (template, data, close_check=false) => {
        if (!this.get(`#${this.dialog_content_id}`)) {
            this.append('body', this.pre_dialogHTML);
        }
        const resultHTML = await this.render(template, data);
        this.openDialog(resultHTML);
        this.invade('#dialog_exit', 'X');
        if (!window.close_dialog){
            window.close_dialog = this.enable_dialog(close_check);
        } else if (close_check){
            window.close_dialog = this.enable_dialog(close_check);
        }
    }

    //UNFINISHED FUNCTION FROM OLD MANGO FARM LIBRARIES. NEEDS DEBUGGING
    alpha_sort = (elems_id, result_list_id, reverse=false, search_tag='data-sort', to_upper=true)=>{
        const word_bank = [];
        const elems = this.get(elems_id);
        console.log(elems);
        // debugger;
        const elem_container = {}; 
        if (!elems){
          return false;
        }
  
        var result_list = this.get(result_list_id);

        if (!result_list){
          return false;
        }

        if (elems.length){
          elems.forEach((elem)=>{
            let sort_word = (to_upper) ? elem.getAttribute(search_tag).toUpperCase() : elem.getAttribute(search_tag);
            word_bank.push(sort_word);        
            elem_container[sort_word] = elem;
            
            elem.parentNode.removeChild(elem);
    
          });  
        }
        const sorted_bank = [...alpha_sort(word_bank, reverse)];
        console.log('SORT',{word_bank:word_bank,sorted:sorted_bank});
        debugger;
        for (let i=0; i<sorted_bank.length; i++){
          result_list.appendChild(elem_container[word_bank[i]]);
        } 

        function alpha_sort(word_bank, reverse=false){   
            if (reverse){
                word_bank.sort(function(a, b){        
                if(a < b) { return 1; }
                if(a > b) { return -1; }
                return 0;
                });
            } else {
                word_bank.sort(function(a, b){        
                if(a < b) { return -1; }
                if(a > b) { return 1; }
                return 0;
                });
            }
            return word_bank;             
          }
    }


    openDialog = (content)=>{
        if (this.get('#dialog_content')) {
            this.invade('#dialog_content', content);    
        } else {
            this.append('body', content);
        }
    }

    close_dialog = ()=>{
        this.destroy('#dialog_container');
    }

    enable_dialog = (close_check)=>{
        return function(){
            if (close_check){
                if (close_check()){
                    this.destroy('#dialog_container');
                }
            } else {
                this.destroy('#dialog_container');
            }
        }.bind(this);
    }

    get (string, context=document){
        let elems = [];
        if (typeof context === "string") { context = this.get(context); }
        if (typeof string === 'string'){
            elems = context.querySelectorAll(string)
        } else {
            return string;
        } 
        if (elems.length === 0) { return null; }
        else if (elems.length === 1 && string.charAt(0) !== '.') { return context.querySelector(string); }
        else {
            return [].slice.call(elems);
        }
    }

    invade (elem, content, context) {
        let str;
        if (typeof elem === "string") { str = elem; elem = this.get(elem, context); }
        else { str = elem; }
        if (elem) {
            if (elem.length && elem.length > 0){
                elem.forEach((el)=>{
                    populate_elem(el, content);
                })
            } else {
                populate_elem(elem, content);
            }
            
        } else { console.log(`ELEMENT ${str} does not exist`); }

        function populate_elem(elem,content){
            if (typeof content === "string") { elem.innerHTML = content; }
            else { elem.innerHTML = ''; elem.appendChild(content); }
        }
    }

    prepend (elem, data, context=document) {
        if (typeof elem == "string"){elem = this.get(elem, context);}
        
        if (typeof data === "string"){
            elem.insertAdjacentHTML('afterbegin', data);
        } else { 
            elem.prepend(data); 
        }
    }

    async render (template, data = {}) {   
        const exists = (this.template_cache[template] !== undefined);
        const result = (!exists) ? await this.ajax.go(`/${this.template_dir}/${template}.html?${this.session_token}`, {}, 'GET') : this.template_cache[template];
        this.template_cache[template] = result;
        const thisTemplate = Template(result);
        var content = thisTemplate.interpolate(data, template);
        return content;
    }

    async insert(template, elem, data={},invade=true, prepend=false){
        elem = this.get(elem);
        const resultHTML = await this.render(template,data);
        if (invade){
            this.invade(elem,resultHTML);
            return data;
        } else {
            if (prepend){
                this.prepend(elem,resultHTML);
                return data;
            } else {
                this.append(elem,resultHTML);
                return data;
            }            
        }            
    }

    

    async_upload = async (input_id='.async_file', single=true, callback=null)=>{
        return new Promise((resolve) => {
            let file = null;
            const async_forms = this.get('.async_form');
            async_forms?.forEach((form)=>{
                const submitHandler = (e) => {
                    //Stub
                  };
                  form.addEventListener('submit', submitHandler);
            });

            const file_inputs = this.get(input_id);
            console.log('FILE INPUTS', file_inputs, typeof file_inputs, input_id, single);
            file_inputs?.forEach((input)=>{
                const changeHandler = ()=>{
                    const this_file = input.files[0];
                    file = this_file;
                    
                    if (single){
                        input.removeEventListener('change', changeHandler);
                    }
                    input.value = '';
                    if (callback){
                        callback(this_file);
                    }
                    resolve(this_file);
                }
                input.addEventListener('change', changeHandler);
            })
            
        });
    }

    async_options = async (option_field='data-option', clickHandler=null)=>{
        return new Promise((resolve) => {
            const focus_input = this.get('.focus_input');
            if (focus_input){
                this.get('.focus_input')[0].focus();
            }

            const async_forms = this.get('.async_form');
            console.log(async_forms);
            async_forms?.forEach((form)=>{
                const submitHandler = (e) => {
                    e.preventDefault();
                    const form_data = this.dataman.jsonify(form);
                    resolve(form_data);
                    form.removeEventListener('submit', submitHandler); 
                  };
                  form.addEventListener('submit', submitHandler);
            });

            const options = this.get('.async_option');
            console.log(options);
            
            options?.forEach((option)=>{
                const clickHandler = () => {
                    const selected_option = option.getAttribute(option_field);
                    resolve(selected_option);
                    option.removeEventListener('click', clickHandler); 
                  };
                  option.addEventListener('click', clickHandler);
            });

        });
    }
    
    load_script= async (script_list)=>{
        const scripts = Array.isArray(script_list) ? script_list : [script_list];
    
        for (let src of scripts) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.onload = () => {
                    console.log('script loaded - ', src);
                    resolve();
                };
                script.onerror = (error) => {
                    console.error('script load error - ', src);
                    reject(error);
                };
                script.src = `${src}?`;
                document.head.appendChild(script);
            });
        }
        console.log('DONE WITH LOOP');
        return true;
    }    
}
Webslinger;

// Public global export
global.Webslinger=Webslinger;
})(typeof window!=='undefined'?window:globalThis);
