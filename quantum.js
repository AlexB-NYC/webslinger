import Ajax from './ajax.js';
import Cipher from './cipher.js';

export class Quantum extends Ajax{
    constructor(session_token, encryption_data=null){
        super(session_token);
        this.active_uploads = {};
        this.finished_uploads = {};
        this.progress_data = {};
        this.progress_hook = null;
        this.encryption_data = encryption_data;
        this.chunk_size = 1000000;
        this.upload_path = '/quantum/upload.php'; 

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
            
            this.progress_data = await this.progress_hook(this.active_uploads); //GET RID OF AWAIT?????

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
        const filename = `${file.name}`;
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
        
        const upload_url = `${this.upload_path}?action=chunk&file_token=${file_token}&session_token=${this.session_token}&path=${this.path}`;   
        
        
        const blob = file.slice(start, stop);
        
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
                return result;
            } catch(error){
                throw error;
            }     
        }
           
    }

    async encrypt_chunk(blob, mimetype){
        console.log(blob, mimetype);
        const b64_blob = await this.blobToBase64(blob);
        console.log(b64_blob);
        // const pinSaltBuffer = window.crypto.getRandomValues(new Uint8Array(16));
        const fileSaltBuffer = await this.cipher.stringToArrayBuffer(this.encryption_data.fileSalt);
        console.log(this.encryption_data.fileSalt,fileSaltBuffer);
        const fileKeyBuffer = await this.cipher.deriveKey(this.encryption_data.priv_key, fileSaltBuffer);
        
        // const pinIvBuffer = window.crypto.getRandomValues(new Uint8Array(16));
        const fileIVBuffer = await this.cipher.stringToArrayBuffer(this.encryption_data.fileIV);
        console.log(this.encryption_data.fileIV,fileIVBuffer);

        const encryptedWithPrivKey = await this.cipher.encrypt(b64_blob, fileKeyBuffer, fileIVBuffer);
        // console.log(encryptedWithPin);
        
        const cipherblob = this.cipher.arrayBufferToBase64(encryptedWithPrivKey);
        console.log(cipherblob);

        // const decrypted_data = await this.cipher.decrypt(encryptedWithPrivKey, fileKeyBuffer, fileIVBuffer);
        // console.log(decrypted_data);
        
        return new Blob([cipherblob], {type:''});
    }

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
            const filename = this.active_uploads[file_token].name;       
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

    

export default Quantum;