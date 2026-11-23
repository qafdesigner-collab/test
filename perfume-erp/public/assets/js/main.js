/* Atelier Perfume ERP · Starts the application once every module above has loaded. */
'use strict';

watchTables();
watchLanguage();
if ($('#language-name')) $('#language-name').textContent = LANGUAGES[state.lang].label;
start();
