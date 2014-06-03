/*-------------------------------------------------------------------------------------------------
 - Project:   Sproutcore WYSIWYG                                                                  -
 - Copyright: ©2012 Matygo Educational Incorporated operating as Learndot                         -
 - Author:    Joe Gaudet (joe@learndot.com) and contributors (see contributors.txt)               -
 - License:   Licensed under MIT license (see license.js)                                         -
 -------------------------------------------------------------------------------------------------*/
/*globals SproutCoreWysiwyg */
/**
 @class

   View class responsible for encapsulating the RTE editor built into modern
 browsers.

 https://developer.mozilla.org/en-US/docs/Rich-Text_Editing_in_Mozilla
 http://msdn.microsoft.com/en-us/library/ms536419(v=vs.85).aspx
 https://dvcs.w3.org/hg/editing/raw-file/tip/editing.html

 @extends SC.View
 @extends SC.Control
 @author Joe Gaudet - joe@learndot.com
 */
SC.WYSIWYGEditorView = SC.View.extend({
  classNames: 'sc-wysiwyg-editor',

  /**
    Whether the editor is presently editable.
    @type Boolean
    @default YES
  */
  isEnabled: YES,

  /**
   A padding, in pixels, that is added to the editor element.

   @type Number
   @default 20
   */
  documentPadding: 20,

  /**
   A text hint that is displayed when the value is empty.

   @type String
   @default ''
   */
  defaultValue: '',

  /**
    This value is added to the bottom of the view's height. This works around a problem where
    a new line will cause the view to jump up before jumping back down.

    @type Number
    @default 25
  */
  lineHeight: 25,

  /**
   Markup to be entered on a carraige return.

   (The default '<p><br></p>' is selected to work around several issues with older Firefox browsers; see
   http://accessgarage.wordpress.com/2009/05/08/how-to-hack-your-app-to-make-contenteditable-work/
   for more.)

   @type String
   @default '<p><br></p>'
   */
  carriageReturnMarkup: '<p><br></p>',

  /**
    Set to true to paste the content of the clipboard as plain text.

   @type Boolean
   @default NO
   */
  pasteAsPlainText: NO,

  /**
   Min height of the frame
   Will be overighted to match the height of the container

   rotide   @readOnlyeeddiittoror
   @property {Number}
   */
  minHeight: 200,

  /**
   @type Boolean
   @default YES
   */
  isTextSelectable: YES,

  /**
   We want the editor to respond to key events

   @type Boolean
   @default YES
   */
  acceptsFirstResponder: YES,

  // ..........................................................
  // INTERNAL SUPPORT
  //

  /** @private */
  displayProperties: ['contentEditable'],

  /** @private */
  contentEditable: function() {
    return this.get('isEnabledInPane') ? 'true' : 'false';
  }.property('isEnabledInPane').cacheable(),

  /** @private */
  render: function (context) {
    var padding = this.get('documentPadding');
    if (!SC.none(padding)) {
      context.addStyle('padding', padding);
    }

    context = context.begin().addClass('sc-wysiwyg-editor-inner');
      context.setAttr('contenteditable', this.get('contentEditable'));
      context.push(this.get('carriageReturnMarkup'));
    context = context.end();
  },

  /** @private */
  update: function (jquery) {
    jquery.find('.sc-wysiwyg-editor-inner').attr('contenteditable', this.get('contentEditable'));

    var padding = this.get('documentPadding');
    if (!SC.none(padding)) {
      jquery.css('padding', padding);
    }
  },

  /** @private */
  init: function () {
    sc_super();
    this.undoManager = SC.UndoManager.create();

    // Renamed property notice.
    if (!SC.none(this.carriageReturnText)) {
      //@if(debug)
      // Deprecated for v1.0
      SC.warn("Developer Warning: The SC.WYSIWYGEditorView property `carriageReturnText` has been renamed `carriageReturnMarkup`. Please update your views. This warning will be removed in a future release.");
      //@endif
      this.set('carriageReturnMarkup', this.get('carriageReturnText'));
    }

    // Firefox: Disable image resizing
    if (SC.browser.isMozilla) {
      this.invokeLast(function () {
        document.execCommand("enableObjectResizing", false, false);
      });
    }
  },

  /** @private */
  destroy: function () {
    this.undoManager.destroy();
    sc_super();
  },

  /** @private */
  didCreateLayer: function () {
    SC.Event.add(this.$().find('.sc-wysiwyg-editor-inner'), 'focus', this, 'focus');
    SC.Event.add(this.$().find('.sc-wysiwyg-editor-inner'), 'blur', this, 'blur');
    SC.Event.add(this.$().find('.sc-wysiwyg-editor-inner'), 'paste', this, 'paste');
  },

  /** @private */
  willDestroyLayer: function () {
    SC.Event.remove(this.$().find('.sc-wysiwyg-editor-inner'), 'focus', this, 'focus');
    SC.Event.remove(this.$().find('.sc-wysiwyg-editor-inner'), 'blur', this, 'blur');
    SC.Event.remove(this.$().find('.sc-wysiwyg-editor-inner'), 'paste', this, 'paste');
  },

  viewDidResize: function() {
    sc_super();
    var width = this.getPath('frame.width'),
        previousWidth = this._previousWidth;
    if (width === previousWidth) return;
    this._previousWidth = width;
    this.invokeNext(this.updateFrameHeight);
  },

  /**
   Whether or not the value has been changed by the editor

   @property {Boolean}
   @private
   */
  _changeByEditor: false,

  /*
    The time when loading of images, fonts, etc. may have been triggered
    by a value or visibility change.

    @property {Boolean}
    @private
  */
  _valueChangeTriggerTime: null,

  /** @private
   Syncronize the value with the dom.
   */
  _valueDidChange: function () {
    
    if (!this._changeByEditor) {
      // if the value was changed as part of the setup,
      // sometimes the dom isn't ready, so we wait till
      // the next run loop
      if (this.get('layer')) {
        this._doUpdateValue();
      } else {
        this.invokeNext(this._doUpdateValue);
      }
    }
    this._changeByEditor = false;
    this._valueChangeTriggerTime = new Date().getTime();
    this.scheduleHeightUpdate();
  }.observes('value'),

  _doUpdateValue: function() {
    var value = this.get('value') || this.get('defaultValue');
    this.$().find('.sc-wysiwyg-editor-inner').html(value);
    this.resetUndoStack();
    this.updateFrameHeight();
  },

  /**
   @private notify the dom that values have been updated.
   */
  notifyDomValueChange: function () {
    var value = this.get('value'),
      html = this.$().find('.sc-wysiwyg-editor-inner').html(); // get the value from the inner document

    if (value !== html) {
      this._changeByEditor = true;
      this.set('value', html);
      this.registerUndo(value);
      this.updateState();
    }
  },

  /** @private
   Internal property used to update the state of the commands
   */
  recomputeEditorState: NO,

  /** @private */
  updateState: function () {
    this.notifyPropertyChange('recomputeEditorState');
  },

  /** @private
   Recompute frame height based on the size of the content inside of the
   editor
   */
  updateFrameHeight: function () {
    var calcHeight = this.computeHeight();
    this.adjust('height', Math.max(calcHeight, this.get('minHeight')));
  },

  /** @private
   Method to compute the height of the the editor.

   @return {Number}
   */
  computeHeight: function () {
    // Get the height of the editable element.
    var layer = this.$().find('.sc-wysiwyg-editor-inner')[0];
    if (!layer) return 0;

    // Get the outer padding, and constrain to no smaller than lineHeight.
    var padding = (this.get('documentPadding') || 0) * 2;
    padding = Math.max(padding, (this.get('lineHeight') || 0));

    return layer.clientHeight + padding;
  },

  /** @private
   Since we can't really know when the elements displayed in the editor are
   loaded (images, fonts, ...) we run a rapid but slowing set of updates over
   the course of ten seconds in hopes of catching any reflows in the act.
   This is particularly useful at initialization, but also if we drag or
   resize an image.

   Since scheduling height updates is useless when we're detached from the
   DOM, we defer scheduled updates until then.
   */
  scheduleHeightUpdate: function () {
    // GATEKEEP: If we're detached, set up an observer on isVisibleInWindow and wait.
    // Note: the reason we don't just observe isVisibleInWindow all the time is that
    // if no height update was scheduled during detachment there's no reason to schedule
    // it on attachment.
    if (!this.get('isVisibleInWindow')) {
      if (!this._isWaitingOnVisible) {
        this.addObserver('isVisibleInWindow', this, this.scheduleHeightUpdate);
        this._isWaitingOnVisible = YES; //sigh flags
      }
      return;
    }

    // If we were waiting for visibility, then clean up and update the DOM trigger time.
    if (this._isWaitingOnVisible) {
      this.removeObserver('isVisibleInWindow', this, this.scheduleHeightUpdate);
      this._isWaitingOnVisible = NO;
      this._valueChangeTriggerTime = new Date().getTime();
    }

    var currentTime = new Date().getTime(),
        gap = currentTime - this._valueChangeTriggerTime + 10;
    // (Adding ten milliseconds slows the initially high rate of updates; improves
    // performance without slowing apparent reaction time or impacting schedule
    // of later, slower updates.)

    if (gap < 10000) {
      this.updateFrameHeight();
      this.invokeOnceLater('scheduleHeightUpdate', gap);
    }
  },

  // ..........................................................
  // RTE SUPPORT
  //

  /**
   Call this method from a commandView to execute the its command

   @param commandView
   */
  invokeCommand: function (commandView) {
    this.focus();

    var command = commandView.get('command');
    if (command) {
      command.execute(commandView, this);
    }
  },

  /**
   Executes a command against the editor:

   https://developer.mozilla.org/en-US/docs/Rich-Text_Editing_in_Mozilla
   http://msdn.microsoft.com/en-us/library/ms536419(v=vs.85).aspx
   https://dvcs.w3.org/hg/editing/raw-file/tip/editing.html

   @param commandName
   @param showDefaultUI
   @param value
   */
  execCommand: function (commandName, showDefaultUI, value) {
    var ret = document.execCommand(commandName, showDefaultUI, value);
    this.notifyDomValueChange();
    return ret;
  },

  /**
   Determines whether or not a commandHasBeen executed at the current
   selection.

   TODO: refactor this mess

   @param commandName
   @returns {Boolean}
   */
  queryCommandState: function (commandName) {
    if (SC.browser.isMozilla) {
      var sel = this.getSelection();
      if (!sel || !sel.anchorNode) return;

      var aNode = sel.anchorNode;

      switch (commandName.toLowerCase()) {

        case 'bold':
          return this._searchForParentNamed(aNode, 'B');
          break;

        case 'italic':
          return this._searchForParentNamed(aNode, 'I');
          break;

        default:
          return '';
          break;
      }

    }
    else {
      var ret = false;
      try {
        ret = document.queryCommandState(commandName);
      }
      catch (e) {
        SC.error('Quering for command state failed: ' + commandName)
      }
      return ret;
    }
  },

  _searchForParentNamed: function (node, name) {
    while (node && (node.nodeName !== "P" || node.nodeName !== "DIV")) {
      if (node.nodeName === name) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  },

  /**
   Determines whether or not a commandHasBeen executed at the current
   selection.

   TODO: refactor this mess

   @param commandName
   @returns {Boolean}
   */
  queryCommandValue: function (commandName) {
    if (SC.browser.isMozilla) {
      var sel = this.getSelection();
      if (!sel || !sel.anchorNode) return;

      var node = sel.anchorNode;
      switch (commandName.toLowerCase()) {

        case 'formatblock':
          while (node && node.nodeName !== "DIV") {
            if (node.nodeName.match(/(P|H[1-6])/)) {
              return node.nodeName.toLowerCase();
            }
            node = node.parentNode;
          }
          return '';
          break;

        default:
          return '';
          break;
      }
    }
    else {
      return document.queryCommandValue(commandName);
    }
  },

  /**
   Insert some html at the current caret position

   @param html {String} html to be inserted
   */
  insertHtmlAtCaret: function (html, notify) {
    var didInsertNode = false;

    if (document.getSelection) {
      var sel = this.getSelection(),
        range;

      if (sel.getRangeAt && sel.rangeCount) {
        range = sel.getRangeAt(0);
        range.deleteContents();
        var el = document.createElement("div"),
          frag = document.createDocumentFragment(),
          node = null,
          lastNode = null;

        el.innerHTML = html;

        while (node = el.firstChild) {
          lastNode = frag.appendChild(node);
        }

        range.insertNode(frag);
        didInsertNode = true;

        if (lastNode) {
          range = range.cloneRange();
          range.setStartAfter(lastNode);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
    else if (document.selection && document.selection.type != "Control") {
      document.selection.createRange().pasteHTML(html);
      didInsertNode = true;
    }

    if (notify !== false) this.notifyDomValueChange();

    return didInsertNode;
  },

  /**
   Set the current range of the selection

   @return range
   */
  saveSelection: function () {
    var range = this.getFirstRange();
    if (range) this._savedSelection = range;
    return this._savedSelection;
  },

  /**
   Restore the previously saved range
   */
  restoreSavedSelection: function () {
    this.setRange(this._savedSelection);
  },

  /**
   Create a new Range object.

   @return range
   */
  createRange: function () {
    if (document.getSelection) {
      return document.createRange();
    }
    else if (document.selection) { //IE 8 and lower
      return document.body.createTextRange();
    }
  },

  /**
   Set a range to the selection
   All the current ranges will be removed first

   @param range
   */
  setRange: function (range) {
    if (range) {
      if (document.getSelection) {
        var sel = this.getSelection();
        if (sel.rangeCount > 0) sel.removeAllRanges();
        sel.addRange(range);
      }
      else if (document.selection && range.select) {
        range.select();
      }
    }
  },

  /**
   Get the current the selection

   @return selection
   */
  getSelection: function () {
    return document.selection || document.getSelection();
  },

  /**
   Get the first range from the selection

   @return range
   */
  getFirstRange: function () {
    if (document.getSelection) {
      var sel = document.getSelection();

      return sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    }
    else if (document.selection && document.selection.createRange) {
      return document.selection.createRange();
    }
  },

  /**
   Determine is the passed range is inside the editor or not.

   @param range
   @return {Boolean}
   */
  rangeIsInsideEditor: function (range) {
    range = range.commonAncestorContainer;
    var editor = this.$().find('.sc-wysiwyg-editor-inner')[0];

    while (range) {
      if (range === editor) {
        return true;
      }
      else range = range.parentNode;
    }
    return false;
  },

  /**
   Cross-browser method to select all the content of the editor

   @return range
   */
  selectNodeContents: function () {
    var layer = this.$().find('.sc-wysiwyg-editor-inner')[0],
      range = this.createRange();

    if (document.getSelection) {
      range.selectNodeContents(layer);
    }
    else if (document.selection) { //IE 8 and lower
      range.moveToElementText(layer);
    }
    return range;
  },

  /**
   Move the caret at the end to the editor
   */
  setCaretAtEditorEnd: function () {
    var range = this.selectNodeContents();
    range.collapse(false);
    this.setRange(range);
  },

  /**
   Reformats

   @param $element
   @param tagName
   @private
   @return reformated element
   */
  _formatElement: function ($element, tagName) {
    var newElement = $('<' + tagName + '/>').append($element.clone().get(0).childNodes);
    $element.replaceWith(newElement);
    return newElement;
  },

  formatNode: function ($element, tagName) {
    var newElement = $(tagName).append($element.clone().get(0).childNodes);
    $element.replaceWith(newElement);
    return newElement;
  },

  // ..........................................................
  // EVENTS
  //

  /** @private

   Hack to avoid the rootResponder to return NO to selectstart
   because the view handle mouseDragged
   */
  respondsTo: function (methodName) {
    if (this._mouseDown && methodName === 'mouseDragged') {
      this._mouseDown = NO;
      return NO;
    }
    return sc_super();
  },

  /** @private*/
  mouseDown: function (evt) {
    this._mouseDown = YES;
    this._mouseDownEvent = evt;
    evt.allowDefault();
    this.updateState();
    return YES;
  },

  /** @private*/
  mouseDragged: function (evt) {
    this.startDrag();
    return YES;
  },

  /** @private*/
  mouseUp: function (evt) {
    evt.allowDefault();
    this.updateState();
    this._mouseDownEvent = null;
    return YES;
  },


  /** @private */
  touchStart: function(evt) {
    evt.allowDefault();
    this._mouseDown = YES;
    return YES;
  },
  /** @private */
  touchesDragged: function(evt, touchesForView) {
    // If we have focus, just allow the event to go back through to the browser.
    if (this.get('hasFirstResponder')) {
      evt.allowDefault();
    }
    // If we've moved too much, we need to pass the touch back to the scroll view that it's presumably wrapped in.
    else {
      var deltaY = Math.abs(evt.pageY - evt.startY);
      if (deltaY > 4) {
        touchesForView.invoke('restoreLastTouchResponder');
      }
    }
    return YES;
  },
  /** @private */
  touchEnd: function(evt) {
    evt.allowDefault();
    this.updateState();
    this._mouseDownEvent = null;
    return YES;
  },

  /** @private*/
  didBecomeFirstResponder: function () {
    this.invokeNext(function () {
      this.$().find('.sc-wysiwyg-editor-inner').focus();
    });
  },

  /** @private*/
  willLoseFirstResponder: function () {
    this.$().find('.sc-wysiwyg-editor-inner').blur();
  },

  /** @private*/
  keyDown: function (evt) {
    var ret = this.interpretKeyEvents(evt) || this.performKeyEquivalent(evt.commandCodes()[0], evt);
    if (!ret) evt.allowDefault();
    return ret;
  },

  /** @private*/
  keyUp: function (evt) {
    // if there are no children lets format the selection with a paragraph
    if (this.$().find('.sc-wysiwyg-editor-inner').children().length === 0) {
      document.execCommand('formatBlock', false, 'p');
    }
    this.notifyDomValueChange();
    this.updateState();
    return YES;
  },

  /** @private Inserts carriageReturnMarkup, if available. */
  insertNewline: function (evt) {
    var carriageReturnMarkup = this.get('carriageReturnMarkup');
    if (!SC.none(carriageReturnMarkup)) this.insertHtmlAtCaret(carriageReturnMarkup);
    else this.allowDefault();
    return YES;
  },

  /** @private*/
  deleteBackward: function (evt) {
    evt.allowDefault();
    return YES;
  },

  deleteForward: function (evt) {
    evt.allowDefault();
    return YES;
  },

  moveLeftAndModifySelection: function (evt) {
    evt.allowDefault();
    return YES;
  },


  moveRightAndModifySelection: function (evt) {
    evt.allowDefault();
    return YES;
  },

  moveUpAndModifySelection: function (evt) {
    evt.allowDefault();
    return YES;
  },

  moveDownAndModifySelection: function (evt) {
    evt.allowDefault();
    return YES;
  },

  /** @private*/
  insertTab: function (evt) {
    evt.preventDefault();
    var nextKeyView = this.get('nextValidKeyView');
    if (nextKeyView) {
      nextKeyView.becomeFirstResponder();
    }
    return YES;
  },

  /** @private*/
  selectAll: function (evt) {
    evt.allowDefault();
    return YES;
  },

  /** @private */
  moveLeft: function (evt) {
    evt.allowDefault();
    return YES;
  },

  /** @private */
  moveRight: function (evt) {
    evt.allowDefault();
    return YES;
  },

  /** @private */
  moveUp: function (evt) {
    evt.allowDefault();
    return YES;
  },

  /** @private */
  moveDown: function (evt) {
    evt.allowDefault();
    return YES;
  },

  /** @private*/
  paste: function (evt) {
    // We need to use originalEvent to be able to access the clipboardData property
    var evt = evt.originalEvent,
      pasteAsPlainText = this.get('pasteAsPlainText');

    if (evt.clipboardData) {
      var data;
      if (pasteAsPlainText) {
        data = evt.clipboardData.getData('text');
      }
      else {
        data = evt.clipboardData.getData('text/html');
        if (data.indexOf('<body>') !== -1) {
          data = data.substring(data.indexOf('<body>'), data.indexOf('</body>'));
        }

        // some times text can be plain
        if (!data) {
          data = evt.clipboardData.getData('text');
        }
      }
      this.insertHtmlAtCaret(data, false);
      evt.preventDefault();
    }
    // doesn't support clipbaordData so lets do this, and remove any
    // horrible class and style information
    else {
      evt.allowDefault();
    }

    if (!pasteAsPlainText) {
      SC.run(function () {
        this.invokeNext(function () {
          this._normalizeMarkup(this.$().find('.sc-wysiwyg-editor-inner').children());
          this._stripFormatting(this.$().find('.sc-wysiwyg-editor-inner').children());
          // TODO: Integrate the MSO filter into the prior two methods to reduce recursive
          // passes through the DOM.
          this._stripMsoJunk(this.$().find('.sc-wysiwyg-editor-inner'));
          this.notifyDomValueChange();
        });
      }, this);
    }
  },

  _normalizeMarkup: function (children) {
    var self = this;
    children.each(function (index, child) {
      var $child = $(child), nodeName = child.nodeName, fontWeight = $child.css('font-weight');

      // If it's a bold tag that for some odd reason has a normal
      // font weight lets un bold it.
      if (nodeName === 'B' && (fontWeight === 'normal' || fontWeight === 400)) {
        $child.children().unwrap();
      }

      // orphan spans lets remove em.
      if (nodeName === 'SPAN' && $child.text() === '') {
        $child.remove();
      }

      // No Font tags allowed
      if (nodeName === 'FONT') {
        $child.children().unwrap();
      }

      self._normalizeMarkup($child.children());
    });
  },

  _stripFormatting: function (children) {
    var self = this;
    children.each(function (index, child) {
      var $child = $(child),
        nodeName = child.nodeName,
        fontWeight = $child.css('font-weight'),
        textAlign = $child.css('text-align');

      // Make sure all anchors spawn new windows.
      if (nodeName === 'A') {
        $child.attr('target', '_blank');
      }

      // If it's a bold tag that for some odd reason has a normal
      // font weight lets un bold it.
      if (nodeName === 'B' && (fontWeight === 'normal' || fontWeight === 400)) {
        $child.children().unwrap();
      }

      // No Font tags allowed
      if (nodeName === 'FONT') {
        $child.children().unwrap();
      }

      $child.attr({
        'id': null,
        'style': null,
        'class': null
      });
      $child.css('text-align', textAlign);
      self._stripFormatting($child.children());
    });
  },

  // Pasting in from MS Office gives you a bunch of technically parseable but really horrible crap. Strip
  // it all out. Gone. Done. Get rid of it.
  // Thanks TinyMCE for the inspiration and regexes!
  // TODO: Integrate the MSO filter into the prior two methods to reduce recursive passes through the DOM.
  _stripMsoJunk: function($el) {
    var content = $el.html();
    
    // Gatekeep: No word junk.
    if (!/class="?Mso|style="[^"]*\bmso-|style='[^'']*\bmso-|w:WordDocument/i.test(content)) return;
    
    // Remove rampant HTML comment if blocks.
    content = content.replace(/<!--[\s\S]+?-->/gi, '');

    // Remove various unwanted tags (comments, scripts (e.g. msoShowComment), the XML tag, VML
    // content, MS Office namespaced tags, and a few others).
    content = content.replace(/<(!|script[^>]*>.*?<\/script(?=[>\s])|\/?(\?xml(:\w+)?|img|meta|link|style|\w:\w+)(?=[\s\/>]))[^>]*>/gi, '');
    
    // OpenXML has this awful thing (<span style="mso-spacerun:yes">    </span>) for runs of empty
    // spaces. Convert them to normal things.
    content = content.replace(
      /<span\s+style\s*=\s*"\s*mso-spacerun\s*:\s*yes\s*;?\s*"\s*>([\s\u00a0]*)<\/span>/gi,
      function(str, spaces) {
        return (spaces.length > 0) ? spaces.replace(/./g, '&nbsp;') : '';
      }
    );

    // Jam the stripped markup back into the element so we can operate on the nodes.
    $el.html(content);

    // Convert Microsofty styles to actual CSS styles.
    $el.children().forEach(this.__stripMsoJunk_StylesRecurser, this);

    // Convert MS's fake lists to semantic lists.
    // MS represents lists as <p> tags whose first <span> contains a bullet (unordered list) or
    // an index ("1.", "a.", or "i."; ordered lists). Detect and wrap sequential list items in
    // <ul> or <ol> tags.

    // NOTE: Detecting fake nested lists is presently out of scope. This will generate one-dimensional
    // ULs and OLs. When someone gets around to it, this page has a stupendous roman numeral translator
    // script: http://blog.stevenlevithan.com/archives/javascript-roman-numeral-converter

    var children = $el.children(),
        child, $child, testText, numberMatch, start, attrs,
        currentListType, // The list type we're currently handling. Used to detect sequential matches.
        $currentList, // The current list element. Sequential matches are added to it.
        i, len = children.length;
    // Iterate through the children (which, wonderfully, doesn't change as we edit things).
    for (i = 0; i < len; i++) {
      child = children[i];
      // If it's not a <p>, move along.
      if (child.nodeName !== 'P') {
        currentListType = null;
        continue;
      }

      // Detect list elements.
      $child = $(child);
      testText = $child.find(':first').text(); // See above for more about this.
      // Detect unordered lists (bullets).
      if (/^\s*[\u2022\u00b7\u00a7\u00d8o\u25CF]\s+$/.test(testText)) {
        // If this is the first sequential unordered list item, kick off a new UL element.
        if (currentListType !== 'ul') {
          currentListType = 'ul';
          currentList = $('<ul />');
          $child.before(currentList);
        }

        // Pop $child off of its parent (and from the children list).
        $child.detach();

        // Convert.
        $child = this.__stripMsoJunk_ConvertFakeLiToRealLi($child);

        // Append the new semantic list item to the current list.
        currentList.append($child);
      }

      // Detect ordered lists ("1. ", "a. ", "i. ").
      else if (/^\s*\w+\.\s+$/.test(testText)) {
        // If this is the first sequential ordered list item, kick off a new UL element.
        if (currentListType !== 'ol') {
          currentListType = 'ol';
          currentList = $('<ol />');
          // Special case: if we're lucky enough to be looking at a numeric list (1. 2. 3.) then
          // let's preserve the number it starts at.
          numberMatch = testText.match(/([0-9])+\./g) || [];
          start = parseInt(numberMatch[0], 10);
          if (!isNaN(start)) {
            currentList.attr('start', start);
          }
          $child.before(currentList);
        }

        // Pop $child off of its parent (and from the children list).
        $child.detach();

        // Convert.
        $child = this.__stripMsoJunk_ConvertFakeLiToRealLi($child);

        // Append the new semantic list item to the current list.
        currentList.append($child);
      }

      // Otherwise, wrap up current cycle.
      else {
        currentListType = null;
        currentList = null;
      }
    }

  },
  // Just some internal functions that I'd prefer to create once and cache.
  __stripMsoJunk_StylesRecurser: function(el) {
    var $el = $(el),
        styles = $el.attr('style') || '',
        newStyles;
    
    // Replace known MSO-weird styles with happy W3C ones.
    newStyles = styles.replace(/horiz-align/gi, 'text-align')
                   .replace(/vert-align/gi, 'vertical-align')
                   .replace(/font-color|mso-foreground/gi, 'color')
                   .replace(/mso-background|mso-highlight/gi, 'background');
    
    // TODO: It would be nice to get rid of any other "mso-" styles. They're ignored by browsers
    // though, and at the moment I embarrassingly don't have the brainspace to work out the regex
    // for "mso-[non-whitespace]: [non-whitespace];".

    // Update the node.
    if (newStyles !== styles) $el.attr('style', styles);

    // Recurse.
    $el.children().forEach(this.__stripMsoJunk_StylesRecurser, this);
  },
  __stripMsoJunk_ConvertFakeLiToRealLi: function($child) {
    // Remove the fake list item elements.
    $child.find(':first').remove();

    // Change the element from a <p> to a <li>.
    attrs = {};
    $.each($child[0].attributes, function(idx, attr) {
      attrs[attr.nodeName] = attr.nodeValue;
    });
    return $('<li />', attrs).append($child.contents());
  },

  /** @private*/
  focus: function (evt) {
    SC.run(this.becomeFirstResponder, this);
  },

  /** @private*/
  blur: function (evt) {
    SC.run(this.resignFirstResponder, this);
  },

  // ..........................................................
  // DRAG
  //

  /** @private*/
  startDrag: function () {
    if (this._didStartDrag) return true;
    var evt = this._mouseDownEvent,
      draggableElements = this.$().find('img'),
      target = evt.target,
      content = target.outerHTML;

    if (draggableElements.is(target)) {
      // If the browser doesn't support caretRangeFromPoint we can't compute where
      // to drop the img.
      // rangy 1.3 will add a cross-browser solution for this.
      if (!document.caretRangeFromPoint) {
        // In this case, we disable the drag
        evt.preventDefault();
        return false;
      }

      this._didStartDrag = true;
      this._target = target;
      this._content = content;

      var dragViewLayer = target.cloneNode(false);
      dragViewLayer.className = dragViewLayer.className + ' sc-wysiwyg-drag-view';
      var dragView = this._dragView = SC.View.create({
        layer: dragViewLayer
      });
      dragView.adjust({ top: evt.pageY - 5, left: evt.pageX - 5 });
      dragView.createLayer();

      SC.Drag.start({
        event: evt,
        source: this,
        dragView: dragView,
        ghost: NO,
      });
    }
    else {
      this._didStartDrag = false;
    }

    return this._didStartDrag;
  },

  /** @private*/
  dragDidMove: function (drag, loc) {
    // Prevent the dragView from being drag by the browser
    drag._lastMouseDraggedEvent.preventDefault();

    // Update the caret position to the place where the element will be drop
    // TODO The caret blink or is invisible
    var range = document.caretRangeFromPoint(loc.x, loc.y);
    this.setRange(range);
  },

  /** @private*/
  dragDidEnd: function (drag, loc) {
    var range = document.caretRangeFromPoint(loc.x, loc.y);

    if (this.rangeIsInsideEditor(range)) {
      this.setRange(range);
      var didInsert = this.insertHtmlAtCaret(this._content, false);
      if (didInsert) {
        this._target.parentNode.removeChild(this._target);
      }
      this.notifyDomValueChange();
    }

    this._didStartDrag = this._target = this._content = null;

    if (this._dragView) {
      this._dragView.destroy();
      this._dragView = null;
    }
  },

  /** @private

   Avoid showing the insertionPoint of a SC.listView if
   we drag an image over a it.
   */
  dragSourceOperationMaskFor: function () {
    return SC.DRAG_NONE;
  },

  // ..........................................................
  // UNDO MANAGER
  //

  /** @private */
  undoManager: null,

  /** @private*/
  undo: function (evt) {
    this.undoManager.undo();
    return YES;
  },

  /** @private */
  redo: function (evt) {
    this.undoManager.redo();
    return YES;
  },

  /** @private */
  registerUndo: function (value) {
    var that = this;

    this.undoManager.registerUndoAction(null, function () {
      that.$().find('.sc-wysiwyg-editor-inner').html(value);
      that.notifyDomValueChange();
      that.setCaretAtEditorEnd();
    });
  },

  /** @private */
  resetUndoStack: function () {
    this.undoManager.reset();
  }

});
