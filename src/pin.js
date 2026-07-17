import { create_logger } from './logger.js';

const logger = create_logger('PIN');

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
        let affected_count = 0;
        for (const input of inputs){
            switch(input.type){
                case 'text':
                case 'number':
                    if(input.id !== 'mobile_pin_input'){
                        input.disabled = disabled;
                        affected_count++;
                    }

            }
        }
        logger.debug('Page inputs toggled', {
            disabled,
            affected_count,
        });
    }




    async input(e) {
        let pins = document.getElementsByClassName(this.pin_class);
        let thisPIN;
        const pin_limit = (this.create) ? 11 : 5;
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


  export default PINCODE;
