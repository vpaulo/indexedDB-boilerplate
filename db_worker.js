const DB_NAME = 'indexeddb-sandbox';
const DB_VERSION = 1; // Use a long long for this value (don't use a float)
const DB_STORE_NAME = 'publications';
let db;

function openDb() {
    console.log("openDb ...");
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = (evt) => {
        db = req.result;
        console.log("openDb DONE");
    };
    req.onerror = (evt) => {
        console.error("openDb:", evt.target.error);
    };

    req.onupgradeneeded = (evt) => {
        console.log("openDb.onupgradeneeded");
        const store = evt.currentTarget.result.createObjectStore(DB_STORE_NAME, { keyPath: 'id', autoIncrement: true });

        store.createIndex('biblioid', 'biblioid', { unique: true });
        store.createIndex('title', 'title', { unique: false });
        store.createIndex('year', 'year', { unique: false });
    };
}

/**
 * @param {string} store_name
 * @param {string} mode either "readonly" or "readwrite"
 */
function getObjectStore(store_name, mode) {
    return db.transaction(store_name, mode).objectStore(store_name);
}

function clearObjectStore() {
    const store = getObjectStore(DB_STORE_NAME, 'readwrite');
    const req = store.clear();
    req.onsuccess = (evt) => {
        postMessage({ type: 'success', message: 'Store cleared' });
        displayPubList(store);
    };
    req.onerror = (evt) => {
        console.error("clearObjectStore:", evt.target.error);
        postMessage({ type: 'failure', message: req.error });
    };
}

function getBlob(key) {
    const store = getObjectStore(DB_STORE_NAME, 'readonly');
    const req = store.get(key);
    req.onsuccess = (evt) => {
        const value = evt.target.result;
        if (value) {
            postMessage({ type: 'blob', blob: value.blob });
        }
    };
}

/**
 * @param {IDBObjectStore=} store
 */
function displayPubList(store) {
    console.log("displayPubList");

    if (typeof store == 'undefined') {
        store = getObjectStore(DB_STORE_NAME, 'readonly');
    }

    postMessage({ type: 'clear' });

    const reqCount = store.count();
    // Requests are executed in the order in which they were made against the
    // transaction, and their results are returned in the same order.
    // Thus the count text below will be displayed before the actual pub list
    // (not that it is algorithmically important in this case).
    reqCount.onsuccess = (evt) => {
        console.log('record(s) in the object store', evt.target.result);
        postMessage({ type: 'records', message: evt.target.result });
    };
    reqCount.onerror = (evt) => {
        console.error("add error", reqCount.error);
        // displayActionFailure(reqCount.error);
        postMessage({ type: 'failure', message: reqCount.error });
    };

    let i = 0;
    const reqCursor = store.openCursor();
    reqCursor.onsuccess = (evt) => {
        const cursor = evt.target.result;

        // If the cursor is pointing at something, ask for the data
        if (cursor) {
            console.log("displayPubList cursor:", cursor);
            const req = store.get(cursor.key);
            req.onsuccess = (e) => {
                console.log('Publist: ', cursor.key, e.target.result);
                postMessage({ type: 'publist', key: cursor.key, value: e.target.result });
            };

            // Move on to the next object in store
            cursor.continue();

            // This counter serves only to create distinct ids
            i++;
        } else {
            console.log("No more entries");
        }
    };
}

/**
 * @param {string} biblioid
 * @param {string} title
 * @param {number} year
 * @param {Blob=} blob
 */
function addPublication(biblioid, title, year, blob) {
    console.log("addPublication arguments:", arguments);
    const obj = { biblioid: biblioid, title: title, year: year };
    if (typeof blob != 'undefined') {
        obj.blob = blob;
    }

    const store = getObjectStore(DB_STORE_NAME, 'readwrite');
    let req;
    try {
        req = store.add(obj);
    } catch (e) {
        if (e.name == 'DataCloneError') {
            postMessage({ type: 'failure', message: "This engine doesn't know how to clone a Blob, use Firefox" });
        }

        throw e;
    }
    req.onsuccess = (evt) => {
        console.log("Insertion in DB successful");
        postMessage({ type: 'success' });
        displayPubList(store);
    };
    req.onerror = () => {
        console.error("addPublication error", req.error);
        postMessage({ type: 'failure', message: req.error });
    };
}

/**
 * @param {string} biblioid
 */
function deletePublicationFromBib(biblioid) {
    console.log("deletePublication:", arguments);
    const store = getObjectStore(DB_STORE_NAME, 'readwrite');
    const req = store.index('biblioid');
    req.get(biblioid).onsuccess = (evt) => {
        if (typeof evt.target.result == 'undefined') {
            // displayActionFailure("No matching record found");
            postMessage({ type: 'failure', message: "No matching record found" });
            return;
        }
        deletePublication(evt.target.result.id, store);
    };
    req.onerror = (evt) => {
        console.error("deletePublicationFromBib:", evt.target.error);
    };
}

/**
 * @param {number} key
 * @param {IDBObjectStore=} store
 */
function deletePublication(key, store) {
    console.log("deletePublication:", arguments);

    if (typeof store == 'undefined') {
        store = getObjectStore(DB_STORE_NAME, 'readwrite');
    }

    // current_view_pub_key of the Object Store Deletion Operation algorithm is
    // undefined, so it's not possible to know if some records were actually
    // deleted by looking at the request result.
    const reqGet = store.get(key);
    reqGet.onsuccess = (evt) => {
        const record = evt.target.result;
        console.log("record:", record);
        if (typeof record == 'undefined') {
            // displayActionFailure("No matching record found");
            postMessage({ type: 'failure', message: "No matching record found" });
            return;
        }
        // Warning: The exact same key used for creation needs to be passed for
        // the deletion. If the key was a Number for creation, then it needs to
        // be a Number for deletion.
        const req = store.delete(key);
        req.onsuccess = (evt) => {
            console.log("evt:", evt);
            console.log("evt.target:", evt.target);
            console.log("evt.target.result:", evt.target.result);
            console.log("delete successful");
            // displayActionSuccess("Deletion successful");
            postMessage({ type: 'success', message: 'Deletion successful' });
            displayPubList(store);
        };
        req.onerror = (evt) => {
            console.error("deletePublication:", evt.target.error);
        };
    };
    reqGet.onerror = (evt) => {
        console.error("deletePublication:", evt.target.error);
    };
}

onmessage = (e) => {
    const { type } = e.data;

    switch (type) {
        case 'getBlob':
            getBlob(e.data.key);
            break;
        case 'add':
            const { biblioid, title, year, blob } = e.data;
            addPublication(biblioid, title, year, blob);
            break;
        case 'delete':
            const { key } = e.data;
            deletePublication(key);
            break;
        case 'deleteBib':
            deletePublicationFromBib(e.data.biblioid);
            break;
        case 'clear':
            clearObjectStore();
            break;
        case 'display':
            displayPubList();
            break;
        default:
            postMessage({ type });
            break;
    }
};

openDb();