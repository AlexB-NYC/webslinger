// ES6 Module Refactor of IIFE

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

export default Cipher;
