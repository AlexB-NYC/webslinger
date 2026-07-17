// src/core.js
import Dataman from './dataman.js';
import Ajax from './ajax.js';
import {Template} from './template.js';
import Quantum from './quantum.js';
import Cipher from './cipher.js';
import PINCODE from './pin.js';
import Autocomplete from './autocomplete.js';
import Events from './events.js';
import { create_logger, describe_url } from './logger.js';

const logger = create_logger('Core');

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

        this.events = this.evt; //backwards compatibility - should reconcile and deprecate

        /*
         * Complete deferrals allow subclasses/apps to block the public
         * webslinger:complete event until their async initialization work has
         * finished. This is intentionally generic so Webslinger does not need
         * ExMachina-specific knowledge.
         */
        this._completeDeferrals = new Map();

        logger.info('Instance initialized', {
            namespace,
            restored_session: Boolean(session_check),
        });

        window.addEventListener("dragover", function (e) {
            e = e || event;
            e.preventDefault();
        }, false);

        window.addEventListener("drop", function (e) {
            e = e || event;
            e.preventDefault();
        }, false);


        queueMicrotask(async () => {
            this.evt.once("rendered", async () => {
                await this.unpreload();
            });

            logger.info('Ready lifecycle started');
            this.evt.emit("ready", { instance: this });

            await this.auto_render();
        });

    };

    dom_ready = () => (
        document.readyState === 'loading'
            ? new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }))
            : Promise.resolve()
    );

    defer_complete = (label="anonymous") => {
        const token = Symbol(label);
        let settled = false;
        let resolve_promise;
        let reject_promise;

        const promise = new Promise((resolve, reject) => {
            resolve_promise = resolve;
            reject_promise = reject;
        });

        const remove = () => {
            this._completeDeferrals.delete(token);
        };

        const deferral = {
            label,
            promise,
            release: () => {
                if (settled) { return false; }
                settled = true;
                remove();
                resolve_promise(true);
                this.evt.emit("complete:deferred:released", {
                    instance: this,
                    label,
                    pending: this._completeDeferrals.size,
                });
                logger.debug('Completion deferral released', {
                    label,
                    pending_count: this._completeDeferrals.size,
                });
                return true;
            },
            reject: (error = new Error(`Complete deferral failed: ${label}`)) => {
                if (settled) { return false; }
                settled = true;
                remove();
                reject_promise(error);
                this.evt.emit("complete:deferred:rejected", {
                    instance: this,
                    label,
                    error,
                    pending: this._completeDeferrals.size,
                });
                logger.error('Completion deferral rejected', {
                    label,
                    pending_count: this._completeDeferrals.size,
                    error,
                });
                return true;
            },
        };

        this._completeDeferrals.set(token, deferral);

        logger.debug('Completion deferred', {
            label,
            pending_count: this._completeDeferrals.size,
        });

        this.evt.emit("complete:deferred", {
            instance: this,
            label,
            pending: this._completeDeferrals.size,
        });

        return deferral;
    }

    _wait_for_complete_deferrals = async () => {
        while (this._completeDeferrals.size) {
            const pending = [...this._completeDeferrals.values()].map(deferral => deferral.promise);
            await Promise.all(pending);
        }
    }

    _emit_complete = async () => {
        try {
            await this._wait_for_complete_deferrals();
            this.evt.emit("complete", { instance: this });
            logger.info('Complete lifecycle emitted');
            return true;
        } catch (error) {
            this.evt.emit("complete:error", {
                instance: this,
                error,
            });
            logger.error('Complete lifecycle failed', { error });
            return false;
        }
    }

    auto_render = async (root = document) => {
        await this.dom_ready();

        const scope = (typeof root === 'string') ? this.get(root) : root;
        if (!scope) {
            this.evt.emit_once("rendered", { instance: this });
            await this._emit_complete();
            return;
        }

        while (true) {
            const mounts = [...scope.querySelectorAll('[data-template][render]')];

            if (!mounts.length) {
                break;
            }

            const prereq = [];
            const normal = [];

            for (const el of mounts) {
                const mode = el.getAttribute('render'); // "" | "prereq"
                (mode === 'prereq' ? prereq : normal).push(el);
            }

            logger.debug('Auto-render batch discovered', {
                mount_count: mounts.length,
                prerequisite_count: prereq.length,
                normal_count: normal.length,
            });

            // prereqs first (blocking)
            for (const el of prereq) {
                await this._render_mount(el);
            }

            this.evt.emit_once("rendered", { instance: this });

            // normals next (parallel non-blocking rendering)
            const normal_promises = normal.map(el => this._render_mount(el));
            if (normal_promises.length) {
                await Promise.allSettled(normal_promises);
            }

            // loop continues until all auto-render content has processed
        }

        this.evt.emit_once("rendered", { instance: this });
        await this._emit_complete();
    };


    unpreload = async () => {
        await this.dom_ready();
        await document.fonts?.ready;
        requestAnimationFrame(() => {
            document.documentElement.classList.remove('preload');
        });
    };

    _repo_mod = null;

    _load_repo = async () => {
        if (this._repo_mod) return this._repo_mod;

        try {
            // cache-bust is fine for now, later you can do a version string
            this._repo_mod = await import(`/data/repo.js?`);
            logger.debug('Shared data repository loaded', {
                export_count: Object.keys(this._repo_mod ?? {}).length,
            });
            return this._repo_mod;
        } catch (error) {
            // repo is optional
            this._repo_mod = null;
            logger.debug('Shared data repository unavailable', {
                error_name: error?.name ?? 'Error',
            });
            return null;
        }
    };

    _load_dataset = async (src) => {
        if (!src) return null;

        // // allow `jobs`, `jobs.js`, `jobs.json` etc
        // const key = String(src).replace(/\.(js|json)$/i, '');

        const key=src;


        // 1) repo.js named export
        const repo = await this._load_repo();
        const from_repo = repo?.[key];
        if (Array.isArray(from_repo)) {
            logger.debug('Dataset loaded from shared repository', {
                dataset: key,
                row_count: from_repo.length,
            });
            return from_repo;
        }

        // 2) fallback to /data/<key>.js default export
        try {
            const mod = await import(`/data/${key}.js?`);
            const from_default = mod?.default;
            if (Array.isArray(from_default)) {
                logger.debug('Dataset loaded from default export', {
                    dataset: key,
                    row_count: from_default.length,
                });
                return from_default;
            }

            // Optional: allow named export in the individual file too (doesn’t hurt)
            const from_named = mod?.[key];
            if (Array.isArray(from_named)) {
                logger.debug('Dataset loaded from named export', {
                    dataset: key,
                    row_count: from_named.length,
                });
                return from_named;
            }

            logger.warn('Dataset export is not an array', { dataset: key });
            return null;
        } catch (error) {
            logger.error('Dataset load failed', { dataset: key, error });
            return null;
        }
    };

    _render_mount = async (el) => {
        const template = el.getAttribute('data-template');
        const dataset = el.getAttribute('data-dataset');

        if (!template) { return false; }

        // IMPORTANT: remove render flag immediately to prevent loops
        el.removeAttribute('render');

        if (dataset) {
            const rows = await this._load_dataset(dataset);
            if (!Array.isArray(rows)) { return true; }

            this.empty(el);

            for (const row of rows) {
                await this.insert(template, el, row, false);
            }
            return true;
        }

        await this.insert(template, el, {}, true);
        return true;
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
                    logger.info('External script loaded', {
                        url: describe_url(src),
                    });
                    this.evt.emit("script:loaded", src);
                    resolve();
                };
                script.onerror = (error) => {
                    logger.error('External script failed', {
                        url: describe_url(src),
                        error,
                    });
                    this.evt.emit("script:error", src, error);
                    reject(error);
                };
                script.src = `${src}?`;
                document.head.appendChild(script);
            });
        }
        logger.info('External script batch completed', {
            script_count: scripts.length,
        });
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
            return navigator.clipboard.writeText(str).then(() => {
                logger.info('Clipboard write completed', {
                    content_length: str?.length ?? 0,
                });
            });
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
        logger.debug('Copy control initialized', {
            element_found: Boolean(copy_elem),
            content_length: str?.length ?? 0,
        });
        copy_elem.addEventListener('click', ()=>{

            if (navigator.clipboard && navigator.clipboard.writeText) {
                // Modern API
                logger.debug('Using Clipboard API');
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
                        logger.info('Fallback clipboard write completed', { success });
                    } catch (err) {
                        logger.error('Fallback clipboard write failed', { error: err });
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

    get (string, context=document){
        if (typeof context === "string") { context = this.get(context); }
        if (!context) { context = document; }

        // If caller passes NodeList/Array as context, use first element
        if (context.length && !context.querySelectorAll) { context = context[0] || document; }

        if (typeof string !== 'string') { return string; }
        if (!string) { return null; }

        let elems;
        try {
            elems = context.querySelectorAll(string);
        } catch (error) {
            logger.warn('Invalid DOM selector', {
                selector: string,
                error,
            });
            return null;
        }

        if (elems.length === 0) { return null; }
        if (elems.length === 1 && string.charAt(0) !== '.') { return elems[0]; }
        return [].slice.call(elems);
    }

    _each = (elem, context=document, fn) => {
        if (typeof fn !== "function") { return false; }

        if (typeof context === "string") { context = this.get(context); }
        if (!context) { context = document; }

        if (typeof elem === "string") { elem = this.get(elem, context); }
        if (!elem) { return false; }

        const list = Array.isArray(elem)
            ? elem
            : (elem && elem.length && typeof elem !== 'string' ? [...elem] : [elem]);

        list.forEach(el => el && el.nodeType && fn(el));
        return true;
    }



    prepend = (elem, data, context=document) =>
        this._each(elem, context, el => {
            if (data == null) { return; }
            if (typeof data === "string") el.insertAdjacentHTML('afterbegin', data);
            else if (data.nodeType) el.prepend(data);
        });

    append = (elem, data, context=document) =>
        this._each(elem, context, el => {
            if (data == null) { return; }
            if (typeof data === "string") el.insertAdjacentHTML('beforeend', data);
            else if (data.nodeType) el.appendChild(data);
        });

    insertBefore = (elem, data, context=document) =>
        this._each(elem, context, el => {
            if (typeof data !== "string") { return; }
            el.insertAdjacentHTML('beforebegin', data);
        });

    invade = (elem, content, context=document) =>
        this._each(elem, context, el => {
            if (content == null) { el.innerHTML = ''; return; }
            if (typeof content === "string") { el.innerHTML = content; return; }
            if (!(content instanceof Node)) { el.innerHTML = ''; return; }
            el.innerHTML = '';
            el.appendChild(content);
        });


    destroy = (elem, context=document) =>
        this._each(elem, context, el => {
            const target = (el.parentNode && el.parentNode.classList.contains('elem_container')) ? el.parentNode : el;
            if (target.parentNode) target.parentNode.removeChild(target);
        });


    empty = (elem, context=document) =>
        this._each(elem, context, el => { el.innerHTML = ""; });



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

    alpha_sort = (elems_id, result_list_id, reverse=false, search_tag='data-sort', to_upper=true)=>{
        // STUB
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


    async render (template, data = {}) {
        const exists = (this.template_cache[template] !== undefined);
        const result = (!exists) ? await this.ajax.go(`/${this.template_dir}/${template}.html?${this.session_token}`, {}, 'GET') : this.template_cache[template];
        this.template_cache[template] = result;
        const thisTemplate = Template(result);
        var content = thisTemplate.interpolate(data, template);
        return content;
    }

    async insert(template, elem, data={},invade=true, prepend=false){
        if (typeof elem === "string") { elem = this.get(elem); }
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
            logger.debug('Async upload controls initialized', {
                selector: input_id,
                single,
                input_count: file_inputs?.length ?? (file_inputs ? 1 : 0),
            });
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
            logger.debug('Async form options initialized', {
                form_count: async_forms?.length ?? (async_forms ? 1 : 0),
            });
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
            logger.debug('Async click options initialized', {
                option_count: options?.length ?? (options ? 1 : 0),
                option_field,
            });

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
                    logger.info('Script loaded', {
                        url: describe_url(src),
                    });
                    resolve();
                };
                script.onerror = (error) => {
                    logger.error('Script failed', {
                        url: describe_url(src),
                        error,
                    });
                    reject(error);
                };
                script.src = `${src}?`;
                document.head.appendChild(script);
            });
        }
        logger.info('Script batch completed', {
            script_count: scripts.length,
        });
        return true;
    }
}

export default Webslinger;
