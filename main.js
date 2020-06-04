// to work in firefox you need to enable history otherwise a mutation error will occur
(() => {

  const db_worker = new Worker('./db_worker.js');
  const pub_msg = $('#pub-msg');
  const pub_list = $('#pub-list');

  function init() {
    db_worker.postMessage({ type: 'launch' });
    db_worker.onmessage = workerOnMessage;
  }

  function workerOnMessage(event) {
    switch (event.data.type) {
      case 'launch':
        console.log('first test', event.data);
        break;
      case 'success':
        const msg = typeof event.data.message != 'undefined' ? "Success: " + event.data.message : "Success";
        $('#msg').html('<span class="action-success">' + msg + '</span>');
        break;
      case 'failure':
        displayActionFailure(event.data.message)
        break;
      case 'clear':
        pub_msg.empty();
        pub_list.empty();
        // Resetting the iframe so that it doesn't display previous content
        newViewerFrame();
        break;
      case 'records':
        pub_msg.append('<p>There are <strong>' + event.data.message +
          '</strong> record(s) in the object store.</p>');
        break;
      case 'publist':
        const { key, value } = event.data;
        var list_item = $('<li>' +
          '[' + key + '] ' +
          '(biblioid: ' + value.biblioid + ') ' +
          value.title +
          '</li>');
        if (value.year != null)
          list_item.append(' - ' + value.year);

        if (value.hasOwnProperty('blob') &&
          typeof value.blob != 'undefined') {
          var link = $('<a href="' + key + '">File</a>');
          link.on('click', () => false);
          link.on('mouseenter', (evt) => {
            setInViewer(evt.target.getAttribute('href'));
          });
          list_item.append(' / ');
          list_item.append(link);
        } else {
          list_item.append(" / No attached file");
        }
        pub_list.append(list_item);
        break;
      case 'blob':
        const { blob } = event.data;
        console.log("setInViewer blob:", blob);
        var iframe = newViewerFrame();

        // It is not possible to set a direct link to the
        // blob to provide a mean to directly download it.
        if (blob.type == 'text/html') {
          var reader = new FileReader();
          reader.onload = (function (evt) {
            var html = evt.target.result;
            iframe.load(function () {
              $(this).contents().find('html').html(html);
            });
          });
          reader.readAsText(blob);
        } else if (blob.type.indexOf('image/') == 0) {
          iframe.load(function () {
            var img_id = 'image-' + current_view_pub_key;
            var img = $('<img id="' + img_id + '"/>');
            $(this).contents().find('body').html(img);
            var obj_url = window.URL.createObjectURL(blob);
            $(this).contents().find('#' + img_id).attr('src', obj_url);
            window.URL.revokeObjectURL(obj_url);
          });
        } else if (blob.type == 'application/pdf') {
          $('*').css('cursor', 'wait');
          var obj_url = window.URL.createObjectURL(blob);
          iframe.load(function () {
            $('*').css('cursor', 'auto');
          });
          iframe.attr('src', obj_url);
          window.URL.revokeObjectURL(obj_url);
        } else {
          iframe.load(function () {
            $(this).contents().find('body').html("No view available");
          });
        }
        break;
      default:
        console.log(`Error running db_worker - type: ${event.data.type} does not exist`);
        break;
    }

    // purge used callbacks
    // delete FetchWorker.runObj[event.data.id];
    return event.data;
  }

  var COMPAT_ENVS = [
    ['Firefox', ">= 16.0"],
    ['Google Chrome',
      ">= 24.0 (you may need to get Google Chrome Canary), NO Blob storage support"]
  ];
  var compat = $('#compat');
  compat.empty();
  compat.append('<ul id="compat-list"></ul>');
  COMPAT_ENVS.forEach(function (val, idx, array) {
    $('#compat-list').append('<li>' + val[0] + ': ' + val[1] + '</li>');
  });

  // Used to keep track of which view is displayed to avoid uselessly reloading it
  var current_view_pub_key;

  function newViewerFrame() {
    var viewer = $('#pub-viewer');
    viewer.empty();
    var iframe = $('<iframe />');
    viewer.append(iframe);
    return iframe;
  }

  function setInViewer(key) {
    console.log("setInViewer:", arguments);
    key = Number(key);
    if (key == current_view_pub_key)
      return;

    current_view_pub_key = key;
    db_worker.postMessage({ type: 'getBlob', key });
  }

  /**
   * @param {string} biblioid
   * @param {string} title
   * @param {number} year
   * @param {string} url the URL of the image to download and store in the local
   *   IndexedDB database. The resource behind this URL is subjected to the
   *   "Same origin policy", thus for this method to work, the URL must come from
   *   the same origin as the web site/app this code is deployed on.
   */
  function addPublicationFromUrl(biblioid, title, year, url) {
    console.log("addPublicationFromUrl:", arguments);

    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    // Setting the wanted responseType to "blob"
    // http://www.w3.org/TR/XMLHttpRequest2/#the-response-attribute
    xhr.responseType = 'blob';
    xhr.onload = (evt) => {
      if (xhr.status == 200) {
        console.log("Blob retrieved");
        const blob = xhr.response;
        console.log("Blob:", blob);
        db_worker.postMessage({ type: 'add', biblioid, title, year, blob });
      } else {
        console.error("addPublicationFromUrl error:",
          xhr.responseText, xhr.status);
      }
    };
    xhr.send();
  }
  function resetActionStatus() {
    console.log("resetActionStatus ...");
    $('#msg').empty();
    console.log("resetActionStatus DONE");
  }

  function displayActionFailure(msg) {
    msg = typeof msg != 'undefined' ? "Failure: " + msg : "Failure";
    $('#msg').html('<span class="action-failure">' + msg + '</span>');
  }

  function addEventListeners() {
    console.log("addEventListeners");

    $('#register-form-reset').click(function (evt) {
      resetActionStatus();
    });

    $('#add-button').click(function (evt) {
      console.log("add ...");
      var title = $('#pub-title').val();
      var biblioid = $('#pub-biblioid').val();
      if (!title || !biblioid) {
        displayActionFailure("Required field(s) missing");
        return;
      }
      var year = $('#pub-year').val();
      if (year != '') {
        // Better use Number.isInteger if the engine has EcmaScript 6
        if (isNaN(year)) {
          displayActionFailure("Invalid year");
          return;
        }
        year = Number(year);
      } else {
        year = null;
      }

      var file_input = $('#pub-file');
      var selected_file = file_input.get(0).files[0];
      console.log("selected_file:", selected_file);
      // Keeping a reference on how to reset the file input in the UI once we
      // have its value, but instead of doing that we rather use a "reset" type
      // input in the HTML form.
      //file_input.val(null);
      var file_url = $('#pub-file-url').val();
      if (selected_file) {
        db_worker.postMessage({ type: 'add', biblioid, title, year, blob: selected_file});
      } else if (file_url) {
        addPublicationFromUrl(biblioid, title, year, file_url);
      } else {
        db_worker.postMessage({ type: 'add', biblioid, title, year });
      }

    });

    $('#delete-button').click(function (evt) {
      console.log("delete ...");
      var biblioid = $('#pub-biblioid-to-delete').val();
      var key = $('#key-to-delete').val();

      if (biblioid != '') {
        db_worker.postMessage({ type: 'deleteBib', biblioid });
      } else if (key != '') {
        // Better use Number.isInteger if the engine has EcmaScript 6
        if (key == '' || isNaN(key)) {
          displayActionFailure("Invalid key");
          return;
        }
        key = Number(key);
        db_worker.postMessage({ type: 'delete', key });
      }
    });

    $('#clear-store-button').click(function (evt) {
      db_worker.postMessage({ type: 'clear' });
    });

    var search_button = $('#search-list-button');
    search_button.click(function (evt) {
      db_worker.postMessage({ type: 'display' });
    });

  }

  init();
  addEventListeners();

})(); // Immediately-Invoked Function Expression (IIFE)