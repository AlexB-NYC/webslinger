const format_message = (component, level, event) => (
    `[Webslinger][${component}][${level.toUpperCase()}] ${event}`
);

const write = (component, level, event, details) => {
    const message = format_message(component, level, event);
    const args = details === undefined ? [message] : [message, details];

    if (level === 'error') {
        console.error(...args);
        return;
    }

    if (level === 'warn') {
        console.warn(...args);
        return;
    }

    console.log(...args);
};

export const create_logger = (component) => Object.freeze({
    debug: (event, details) => write(component, 'debug', event, details),
    info: (event, details) => write(component, 'info', event, details),
    warn: (event, details) => write(component, 'warn', event, details),
    error: (event, details) => write(component, 'error', event, details),
});

export const describe_url = (value) => {
    const url = String(value ?? '');
    const separator_index = url.search(/[?#]/);
    return separator_index === -1 ? url : url.slice(0, separator_index);
};
