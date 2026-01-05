class QRCode {
    constructor(text, size = 256) {
        this.text = text;
        this.size = size;
        this.modules = this.generateQRCodeMatrix(text);
    }

    generateQRCodeMatrix(text) {
        const padZero = (str, len) => str.padStart(len, '0');
        
        // Convert to base64 and to binary
        const data = btoa(text).split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join('');
        
        // Ensure the version calculation handles longer data properly
        const version = Math.max(1, Math.ceil(data.length / 44)); // Update this based on length
        const size = 17 + 4 * version;
        const matrix = Array.from({ length: size }, () => Array(size).fill(0));

        // Draw position detection patterns
        this.drawPositionPatterns(matrix, size);

        // Encode data and pad if necessary
        this.encodeData(matrix, data, size);

        return matrix;
    }

    drawPositionPatterns(matrix, size) {
        const setPattern = (x, y) => {
            for (let i = 0; i < 7; i++) {
                for (let j = 0; j < 7; j++) {
                    if (
                        (i === 0 || i === 6 || j === 0 || j === 6) || 
                        (i >= 2 && i <= 4 && j >= 2 && j <= 4)
                    ) {
                        matrix[y + i][x + j] = 1;
                    }
                }
            }
        };
        setPattern(0, 0);           // Top-left
        setPattern(size - 7, 0);     // Top-right
        setPattern(0, size - 7);     // Bottom-left
    }

    encodeData(matrix, data, size) {
        const addBits = (x, y, bit) => matrix[y][x] = bit ? 1 : 0;
        
        let [x, y, direction] = [size - 1, size - 1, -1];
        
        for (let i = 0; i < data.length; i++) {
            // Ensure data fills within valid bounds of the matrix
            if (matrix[y][x] === 0) {
                addBits(x, y, data[i] === '1');
            }
            
            // Handle zigzag movement and boundary conditions
            if (x % 2 === 0) { // move left and up
                if (y === 0 || matrix[y - 1][x] !== 0) {
                    x -= 1;
                } else {
                    y -= 1;
                }
            } else { // move left and down
                if (y === size - 1 || matrix[y + 1][x] !== 0) {
                    x -= 1;
                } else {
                    y += 1;
                }
            }

            // Boundary check for x
            if (x < 0) {
                x = size - 1;
                y -= 2;
                if (y < 0) y = 0;
            }
        }
        
        // Pad remaining bits
        const remainingBits = size * size - data.length;
        for (let i = 0; i < remainingBits; i++) {
            if (matrix[y][x] === 0) {
                addBits(x, y, 0);  // Add padding bit
            }
            
            // Continue zigzag traversal as above
            if (x % 2 === 0) {
                if (y === 0 || matrix[y - 1][x] !== 0) {
                    x -= 1;
                } else {
                    y -= 1;
                }
            } else {
                if (y === size - 1 || matrix[y + 1][x] !== 0) {
                    x -= 1;
                } else {
                    y += 1;
                }
            }

            if (x < 0) {
                x = size - 1;
                y -= 2;
                if (y < 0) y = 0;
            }
        }
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
        const data_url = canvas.toDataURL();

        if (type === 'img') {
            const img = new Image();
            img.src = data_url;
            img.width = img.height = this.size;
            return img;
        }
        return data_url;
    }
}

export default QRCode;
