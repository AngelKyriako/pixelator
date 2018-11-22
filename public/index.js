function GlobalCanvas(_imageModel, _imageCanvas) {

  var _prevPixels = {};

  _fakePixelSize = {
    width: _imageCanvas.width / _imageModel.width,
    height: _imageCanvas.height / _imageModel.height,
  };

  var _imageCanvasContext = _imageCanvas.getContext('2d');

  function repaintAllPixels(isInitialization) {
    for (i = 0; i < _imageModel.pixels.length; ++i) {
      PaintPixelAtIndex(i, _imageModel.pixels[i], isInitialization)
    }
  }

  function PaintPixelAtIndex(index, pixel, isInitialization) {
    var x = index % _imageModel.width;
    var y = Math.floor(index / _imageModel.width);

    var trueX = x * _fakePixelSize.width;
    var trueY = y * _fakePixelSize.height;

    _imageCanvasContext.beginPath();
    _imageCanvasContext.rect(trueX, trueY, _fakePixelSize.width, _fakePixelSize.height);

    _imageCanvasContext.fillStyle = RGBToHex(pixel.r, pixel.g, pixel.b);
    _imageCanvasContext.fill();

    _imageCanvasContext.stroke();
    _imageCanvasContext.closePath();

    if (!isInitialization) {
      _prevPixels[index] = _imageModel.pixels[index];
      _imageModel.pixels[index] = pixel;
    }
  }

  function RGBToHex(r, g, b) {
    return '#' + r.toString(16) + g.toString(16) + b.toString(16);
  }

  var api = {
    getPixelIndex: (x, y) => x + y * _imageModel.width,
    
    paintDiff: (diff) => {
      for (i in diff.indices) {
        pixelIndex = diff.indices[i];

        PaintPixelAtIndex(pixelIndex, diff.pixel);
      }
    },

    paintDiffRevert: (diff) => {
      var pixelToRevert = diff.pixel;
      var currentPixel;
      for (i in diff.indices) {
        pixelIndex = diff.indices[i];
        currentPixel = _imageModel.pixels[pixelIndex];

        if (
          pixelToRevert.r == currentPixel.r &&
          pixelToRevert.g == currentPixel.g &&
          pixelToRevert.b == currentPixel.b &&
          pixelToRevert.a == currentPixel.a
        ) {
          PaintPixelAtIndex(pixelIndex, _prevPixels[pixelIndex]);
        }
      }
    },
  };

  repaintAllPixels(true);

  return api;
}

var _user;
var _geoByIp = Cookies.getJSON("geo");

var _globalCanvas;
var _chatUI;
var _colorPickerUI;

$.get('/api/me').done(function(usr) {
  _user = usr;
  console.info('user: ', _user);
}).fail(function(err){
  console.error('/api/me: ', err);
});

if (!_geoByIp) {
 $.get('/api/geo').done(function(geo) {
    _geoByIp = geo;
    console.info('geolocation by ip: ', _geoByIp);
  }).fail(function(err) {
    console.error('/api/geo: ', err);
  }); 
} else {
  console.info('cookie geolocation: ', _geoByIp);
  // cookie exists, set to undefined so that we can manually test
  // that the data are set from the cookie
  _geoByIp = undefined;
}

// input management
$('document').ready(function onReady() {
  $.get('/api/globalcanvas').done(function(image) {

    _globalCanvas = new GlobalCanvas(
      image, 
      document.getElementById('globalCanvas')
    )

    console.info('global canvas: ', image);
  }).fail(function(err){
    console.error('/api/globalcanvas: ', err);
  });

  _colorPickerUI = {
    color: $("#color-picker"),
    startX: $("#color-picker-start-x"),
    startY: $("#color-picker-start-y"),
    width: $("#color-picker-width"),
    height: $("#color-picker-height"),
    applyBtn: $("#color-picker-apply-btn")
  };

  _colorPickerUI.applyBtn.click(function() {

    var startX;
    var starty;
    var width;
    var height;
    try {
      startX = parseInt(_colorPickerUI.startX.val());
      startY = parseInt(_colorPickerUI.startY.val());
      width = parseInt(_colorPickerUI.width.val());
      height = parseInt(_colorPickerUI.height.val());        
    } catch(e) {
      return console.info("Bad rectrangle input, aborting...");
    }
    var rgbArray = _colorPickerUI.color.val()
      // #XXXXXX => ["XX", "XX", "XX"]
      .match(/[A-Za-z0-9]{2}/g)
      // ["XX", "XX", "XX"] => [n, n, n]
      .map(function(v) { return parseInt(v, 16) });

    var args = {
      pixel: {r: rgbArray[0], g: rgbArray[1], b: rgbArray[2], a: 255},
      startX,
      startY,
      endX: startX + width,
      endY: startY + height,
    };

    $.ajax({
      type: "POST",
      url: '/api/globalcanvas/paint',
      data: args,
      dataType: 'json'
    }).done(function(diff) {
      // Do nothing, the socket event takes care of drawing.
      console.info('canvas paint successful. Diff applied', diff);
    })
    .fail(function(err) {
      console.error('send pixels to paint, failed with error: ', err);
    });    
  });

  _chatUI = {
    form: $("#chat-input"),
    inputText: $("#message-text-input"),
    messages: $("#chat-messages"),
    maxWordLength: 35,
    wordSplitRegex: new RegExp('[\r\n ]')
  }

  function submitMessage() {
    $.ajax({
      type: "POST",
      url: '/api/message',
      data: {
        text: _chatUI.inputText.val(),
        geo: _geoByIp
      },
      dataType: 'json'
    }).done(function(messageSent) {
      if (messageSent.view) {
        _chatUI.messages.append(messageSent.view); 
      } else {
        window.location.replace('/');
      }
    })
    .fail(function(err) {
      console.error('send message, failed with error: ', err);
    });

    _chatUI.inputText.val('');
  }

  _chatUI.inputText.on('input', function(e) {
    var text = $(this).val();
    var words = text.split(_chatUI.wordSplitRegex);
    var lastWord = words[words.length - 1];
    if (lastWord.length > _chatUI.maxWordLength) {
      $(this).val(text + ' ');
    }
  });

  _chatUI.inputText.keydown(function(e) {
    // Enter key sends the message.
    // Unless the shift key is being pressed.
    if (e.keyCode === 13 && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  });

  _chatUI.form.on("submit", function(e) {
      e.preventDefault();

      submitMessage();
  });

});

// socket events
if (io) {
  var socket = io();

  socket.on('chat.message', function(message) {
    console.info('message received', message);

    // append if not sender
    if (!_user ||
      (message.model.creator.id !== _user.id &&
        message.model.creator.id !== _user._id)) {

      _chatUI.messages.append(message.view);
    }
  });

  socket.on('image.paintpixels', function(imageDiffToApply) {
    console.info('image diff sent, applying...', imageDiffToApply);

    _globalCanvas.paintDiff(imageDiffToApply);
  });

  socket.on('image.paintpixels.revert', function(imageDiffToRevert) {
    console.info('image diff sent, failed to be applied, reverting...', imageDiffToRevert);

    _globalCanvas.paintDiffRevert(imageDiffToRevert);
  });
}
