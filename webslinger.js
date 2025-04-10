import Dataman from './dataman.js';
import Ajax from './ajax.js';
import {Template} from './template.js';
import Quantum from './quantum.js';
import Cipher from './cipher.js';
import PINCODE from './pin.js';
import Autocomplete from './autocomplete.js';
import QRCode from './qr.js';

class Webslinger{    
    constructor(){
        this.template_dir = 'interface';
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


        window.addEventListener("dragover", function (e) {
            e = e || event;
            e.preventDefault();
        }, false);

        window.addEventListener("drop", function (e) {
            e = e || event;
            e.preventDefault();
        }, false);
       
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
        }
    }
 
    load_external= async (script_list)=>{
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

    qr = (qr_string, qr_size)=>{
        const qr = new QRCode(qr_string, qr_size);
        return qr;
    }
        
    append (elem, data, context) {
        if (typeof elem == "string") { elem = this.get(elem, context); }
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
          if (elem.length){
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
            // console.log('NEW DIALOG');
            this.append('body', this.pre_dialogHTML);
        }
        const resultHTML = await this.render(template, data);
        // console.log(template, resultHTML);
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
            // console.log('EXISTING DIALOG');
            this.invade('#dialog_content', content);    
        } else {
            this.append('body', content);
        }
        // return content;            
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
        // console.log(elem,content,context);
        // console.log(typeof elem);
        // debugger;
        let str;
        if (typeof elem === "string") { str = elem; elem = this.get(elem, context); }
        else { str = elem; }
        // console.log(elem, typeof elem, elem.length);
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
        // console.log()
        const exists = (this.template_cache[template] !== undefined);
        // console.log(exists, this.template_cache);        
        const result = (!exists) ? await this.ajax.go(`/${this.template_dir}/${template}.html?${this.session_token}`) : this.template_cache[template];
        // console.log(result);
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
            // console.log(async_forms);
            async_forms?.forEach((form)=>{
                const submitHandler = (e) => {
                    // if (!file){
                    //     e.preventDefault();
                        
                    //     alert('Must upload file to proceed.')
                    //     // form.removeEventListener('submit', submitHandler);
                    // }
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
    // getJSON = async(url) => {
    //     try{
    //         const response = await fetch(url);
    //         console.log(response);
    //         const content_type = response.headers.get("content-type");
        
    //         switch (content_type.toLowerCase()){
    //             case 'application/json; charset=utf-8':
    //             case 'text/html; charset=utf-8':
    //             case 'application/json':
    //             return response.json(); // get JSON from the response 
    //             break;
                

    //             default:
    //             return response.blob();
    //             break;
    //         }
    //     } catch (error){
    //         console.log('JSON FETCH ERROR', error, url);
    //     }
        
    // }


}

export default Webslinger;