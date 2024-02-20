// ES6 Module Refactor of IIFE

let self;

class Cipher {
  constructor() {
    self = this;
    this.algos = {"01": {method: "triplesec"}, "02": {method: "forge"}};
    this.counter = null;
    this.hex = false;
  }

  getEntropy(callback) {
    // ui.insert('entropy_generation', '#dialog_content').then(() => {
      const crypto = window.crypto || window.mscrypto;
      let finals = new Uint32Array(8);
      self.counter = null;
      finals = self.csprng_entropy(finals, crypto);
      finals = self.timing_entropy(finals, crypto);
      finals = self.mouse_entropy(finals, crypto, callback);
      console.log('HEX', this.hex);
    // });
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




    async generateKey(passphrase, salt, keyLength = 256) {
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

    async encryptAESCBC(plaintext, key, iv) {
        const encrypted = await window.crypto.subtle.encrypt(
        {
            name: "AES-CBC",
            iv: iv,
        },
        key,
        new TextEncoder().encode(plaintext)
        );

        return encrypted;
    }

    async decryptAESCBC(ciphertext, key, iv) {
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

  async doubleLayerEncrypt(seedPhrase, pin, password) {
    // Derive key from PIN and encrypt seedPhrase
    const pinSalt = window.crypto.getRandomValues(new Uint8Array(16));
    const pinKey = await this.deriveKey(pin, pinSalt);
    const pinIv = window.crypto.getRandomValues(new Uint8Array(16));
    const encryptedWithPin = await this.encrypt(seedPhrase, pinKey, pinIv);

    // Derive key from password and encrypt the above ciphertext
    const passwordSalt = window.crypto.getRandomValues(new Uint8Array(16));
    const passwordKey = await this.deriveKey(password, passwordSalt);
    const passwordIv = window.crypto.getRandomValues(new Uint8Array(16));
    const encryptedWithPassword = await this.encrypt(encryptedWithPin, passwordKey, passwordIv);

    // Return all necessary data for decryption
    return {
      encryptedData: encryptedWithPassword,
      pinIv: pinIv,
      pinSalt: pinSalt,
      passwordIv: passwordIv,
      passwordSalt: passwordSalt
    };
  }

  async doubleLayerDecrypt(encryptedData, pin, password, pinIv, passwordIv, pinSalt, passwordSalt) {
    // Derive key from password and decrypt
    const passwordKey = await this.deriveKey(password, passwordSalt);
    const decryptedWithPassword = await this.decrypt(encryptedData, passwordKey, passwordIv);

    // Derive key from PIN and decrypt
    const pinKey = await this.deriveKey(pin, pinSalt);
    const decryptedWithPin = await this.decrypt(decryptedWithPassword, pinKey, pinIv);

    return decryptedWithPin;
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  // Convert a Base64 string to an ArrayBuffer
  base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export default Cipher;
