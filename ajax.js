import Dataman from './dataman.js';

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
            }
        };
    
        if (method !== 'GET') {
            options.body = data;
        }
    
        const response = await fetch(url, options);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    
        return await response.text();
    }
    
    async head(url){       
        return (this.go(url,{},'HEAD'));                         
    }

    async blob(url, blob) {
        // console.log(url,blob);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-type': 'application/x-www-form-urlencoded'
            },
            body: blob
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    
        return await response.json();
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

export default Ajax;