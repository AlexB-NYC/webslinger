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

}

export default Dataman;