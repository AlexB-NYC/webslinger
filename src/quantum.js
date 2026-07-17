import Ajax from './ajax.js';
import Cipher from './cipher.js';
import { create_logger } from './logger.js';

const logger = create_logger('Quantum');

export class Quantum extends Ajax{
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
        logger.info('File reconstruction started', {
            encrypted_size: blob?.size ?? null,
            extension: ext,
            has_file_token: Boolean(file_token),
        });
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
            logger.debug('Encrypted file read', {
                encoded_size: blobText.length,
            });

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
            logger.info('File reconstruction completed', {
                output_size: reconstruct?.size ?? null,
                output_type: reconstruct?.type || 'unspecified',
            });

            // Assuming you want to return the result of `receive_file`
            return reconstruct;
        } catch (error) {
            logger.error('File reconstruction failed', { error });
            throw error; // Rethrow or handle error as needed
        }
    }

    async receive_file(file_token){
        const file = this.active_uploads[file_token];
        const total_chunks = Math.ceil(file.size / this.chunk_size);
        let current_chunk = 0;
        logger.info('Encrypted file receive started', {
            file_size: file.size,
            total_chunks,
            extension: file.ext,
        });
        this.active_uploads[file_token].total = total_chunks;
        file.status = 'uploading';

        while (current_chunk < total_chunks) {
            let chunk_result = await this.receive_chunk(file_token, current_chunk);
            logger.debug('File chunk received', {
                chunk_index: current_chunk,
                chunk_size: chunk_result?.length ?? chunk_result?.byteLength ?? null,
                total_chunks,
            });
            this.active_uploads[file_token].decrypted += chunk_result;
            current_chunk++;
            this.active_uploads[file_token].current = current_chunk;
            // this.progress_hook(this.active_uploads);
        }
        const base64 = file.decrypted.substring(file.decrypted.indexOf(',') + 1);
        const mime_type = this.file_types[file.ext];
        const file_blob = this.cipher.base64ToBlob(base64,mime_type);
        logger.info('Encrypted file receive completed', {
            output_size: file_blob.size,
            mime_type: mime_type || 'unspecified',
            total_chunks,
        });
        return file_blob;

    }

    async receive_chunk(file_token, current_chunk){
        const file = this.active_uploads[file_token];

        const start = current_chunk * this.chunk_size;
        const stop = start + this.chunk_size;
        logger.debug('Decrypting received chunk', {
            chunk_index: current_chunk,
            start,
            stop,
            encryption_configured: Boolean(this.encryption_data),
        });
        const new_blob = file.encrypted.slice(start, stop);
        const decrypted_blob = await this.decrypt_chunk(new_blob, this.active_uploads[file_token].type);
        return decrypted_blob;
    }

    async decrypt_chunk(blob, mimetype){
        logger.debug('Chunk decryption started', {
            encoded_size: blob?.length ?? blob?.byteLength ?? null,
            mime_type: mimetype || 'unspecified',
        });
        const encryptedBuffer = await this.cipher.base64ToArrayBuffer(blob);
        const fileSaltBuffer = await this.cipher.stringToArrayBuffer(this.encryption_data.fileSalt);
        const fileKeyBuffer = await this.cipher.deriveKey(this.encryption_data.priv_key, fileSaltBuffer);
        const fileIVBuffer = await this.cipher.stringToArrayBuffer(this.encryption_data.fileIV);
        try {
            const decrypted_data = await this.cipher.decrypt(encryptedBuffer, fileKeyBuffer, fileIVBuffer);
            logger.debug('Chunk decryption completed', {
                output_size: decrypted_data?.length ?? null,
            });
            return decrypted_data;
        } catch (error) {
            logger.error('Chunk decryption failed', { error });
        }
    }

    async batch(files, path, progress_hook=()=>{}){
        logger.info('Upload batch started', {
            file_count: Object.keys(files ?? {}).length,
            path,
            has_progress_hook: typeof progress_hook === 'function',
            encryption_enabled: Boolean(this.encryption_data),
        });
        this.progress_hook = progress_hook;
        this.path = path;
        const upload_results = {};
        for (let file_token in files){
            const file = files[file_token].file;
            logger.debug('File queued', {
                file_size: file?.size ?? null,
                file_type: file?.type || 'unspecified',
            });
            this.active_uploads[file_token] = file;
            this.active_uploads[file_token].current = 0;
            this.active_uploads[file_token].total = 0;
            files[file_token].status = 'queued';

            this.progress_data = this.progress_hook(this.active_uploads); //GET RID OF AWAIT?????

            const upload_result = await this.send_file(file_token);
            upload_results[file_token] = upload_result;
        }

        logger.info('Upload batch completed', {
            file_count: Object.keys(upload_results).length,
        });
        return upload_results;
    }

    async send_file(file_token){
        const file = this.active_uploads[file_token];
        // debugger;

        const total_chunks = Math.ceil(file.size / this.chunk_size);
        let current_chunk = 0;
        logger.info('File upload started', {
            file_size: file.size,
            file_type: file.type || 'unspecified',
            total_chunks,
            encryption_enabled: Boolean(this.encryption_data),
        });
        this.active_uploads[file_token].total = total_chunks;
        file.status = 'uploading';

        while (current_chunk < total_chunks) {
            let chunk_result = await this.send_chunk(file_token, current_chunk);
            logger.debug('File chunk uploaded', {
                chunk_index: current_chunk,
                total_chunks,
                response_type: typeof chunk_result,
            });
            current_chunk++;
            this.active_uploads[file_token].current = current_chunk;
            this.progress_hook(this.active_uploads);
        }
        const filename = (this.encryption_data) ? `${file.name}.encrypted` : file.name;
        const directory = file.directory ?? '';
        const path = this.path;
        const finalize_url = `${this.upload_path}?action=finish&file_token=${file_token}&session_token=${this.session_token}`;
        const result = await this.json(finalize_url, {filename, directory, path});
        this.active_uploads[file_token].status = 'finished';
        this.progress_hook(this.active_uploads);
        logger.info('File upload completed', {
            file_size: file.size,
            total_chunks,
            encrypted: Boolean(this.encryption_data),
        });
        return result;
    }

    async send_chunk(file_token, current_chunk){
        const file = this.active_uploads[file_token];
        const start = current_chunk * this.chunk_size;
        const stop = start + this.chunk_size;

        const upload_url = `${this.upload_path}?action=chunk&index=${current_chunk}&file_token=${file_token}&session_token=${this.session_token}&path=${this.path}`;
        const blob = file.slice(start, stop);
        logger.debug('Chunk upload started', {
            chunk_index: current_chunk,
            chunk_size: blob.size,
            encryption_enabled: Boolean(this.encryption_data),
        });
        if (this.encryption_data){
            const encrypted_blob = await this.encrypt_chunk(blob, this.active_uploads[file_token].type);
            try {
                const result = await this.blob(upload_url, encrypted_blob);
                return result;
            } catch(error){
                logger.error('Encrypted chunk upload failed', {
                    chunk_index: current_chunk,
                    error,
                });
                throw error;
            }
        } else {
            try {
                const result = await this.blob(upload_url, blob);
                return result;
            } catch(error){
                logger.error('Chunk upload failed', {
                    chunk_index: current_chunk,
                    error,
                });
                throw error;
            }
        }

    }

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
            const filename = (this.encryption_data) ? `${this.active_uploads[file_token].name}.encrypted` : this.active_uploads[file_token].name;
            const result = await this.json(finalize_url, {filename});
            this.active_uploads[file_token].status = 'finished';
            this.progress_hook(this.active_uploads);
            logger.info('Upload finalized', {
                encryption_enabled: Boolean(this.encryption_data),
                active_upload_count: Object.keys(this.active_uploads).length,
            });
            return result;
        } catch (error) {
            logger.error('Upload finalization failed', { error });
        }

    }
}



export default Quantum;
