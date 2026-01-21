module.exports = [
    {
        files: ["website/js/*.js"],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "script",
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                fetch: "readonly",
                URL: "readonly",
                Promise: "readonly",
                setTimeout: "readonly",
                performance: "readonly",
                alert: "readonly",
                google: "readonly",
                login: "readonly",
                ThrottledBatch: "readonly",
                persistentCoalesce: "readonly",
                fetchWithAuth: "readonly",
                ACCESS_TOKEN: "writable",
                API_KEY: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off",
            "no-undef": "error"
        }
    }
];
