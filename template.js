export function Template(str) {
    const stringObj = new String(str);
    return new Proxy(stringObj, {
      get(target, prop) {
        if (prop === 'interpolate') {
          return function(params, template, identifiers = []) {
            try {
              let parser = new DOMParser();
              let doc = parser.parseFromString(target, 'text/html');
  
              let elements = doc.querySelectorAll('[data-access]');
              elements.forEach(element => {
                let access = element.getAttribute('data-access');
                if (!identifiers.includes(access)) {
                  element.parentNode.removeChild(element);
                }
              });
  
              let serializer = new XMLSerializer();
              let preInterpolatedString = serializer.serializeToString(doc);
  
              preInterpolatedString = preInterpolatedString.replace(/<!DOCTYPE html>.*<body>/, '');
              preInterpolatedString = preInterpolatedString.replace(/<\/body>.*<\/html>/, '');
  
              const names = Object.keys(params);
              const vals = Object.values(params);
  
              const parsed_template = new Function(...names, `return \`${preInterpolatedString}\`;`)(...vals);
              return parsed_template;
            } catch (error) {
              window.console.log('INTERPOLATION ERROR', error);
            }
          };
        }
  
        if (typeof target[prop] === 'function') {
          return target[prop].bind(target);
        }
  
        return target[prop];
      },
    });
  }
  