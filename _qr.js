class QRCode {
    constructor(text, size = 256) {
        this.text = text;
        this.size = size;
        this.modules = this.generateQRCodeMatrix(text);
    }

    generateQRCodeMatrix(text) {
        const padZero = (str, len) => str.padStart(len, '0');
        const data = [...new TextEncoder().encode(text)].map(byte => padZero(byte.toString(2), 8)).join('');
        const version = Math.ceil((data.length + 17) / 72);
        const size = 17 + 4 * version;
        const matrix = Array.from({ length: size }, () => Array(size).fill(0));

        const setPattern = (x, y, w, h) => {
            for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) matrix[y + j][x + i] = 1;
        };
        setPattern(0, 0, 9, 9);
        setPattern(size - 9, 0, 9, 9);
        setPattern(0, size - 9, 9, 9);

        const encodeData = (data) => {
            const addBits = (x, y, bit) => matrix[y][x] = bit ? 1 : 0;
            let [x, y, direction] = [size - 1, size - 1, -1];
            for (let i = 0; i < data.length; i++) {
                addBits(x, y, data[i] === '1');
                x -= 1;
                if (x < 0 || matrix[y][x] !== 0) {
                    x += 2;
                    y += direction;
                    if (y < 0 || y >= size) {
                        y -= direction;
                        direction = -direction;
                        x -= 2;
                    }
                }
            }
        };
        encodeData(data + padZero('0', size * size - data.length));

        return matrix;
    }

    draw(ctx) {
        const scale = this.size / this.modules.length;
        this.modules.forEach((row, y) => {
            row.forEach((cell, x) => {
                ctx.fillStyle = cell ? '#000' : '#fff';
                ctx.fillRect(x * scale, y * scale, scale, scale);
            });
        });
    }

    generate(type='url') {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = this.size;
        this.draw(canvas.getContext('2d'));
        const data_url = canvas.toDataURL()

        switch (type){
            case 'url':
                return data_url;
            break;

            case 'img':
                const img = new Image();
                img.src = data_url;
                img.width = img.height = this.size;
                return img;
            break;
        }
        
        

        
    }
}



export default QRCode;