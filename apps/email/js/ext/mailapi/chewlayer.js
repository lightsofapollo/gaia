
/**
 * Process text/plain message bodies for quoting / signatures.
 *
 * We have two main goals in our processing:
 *
 * 1) Improve display by being able to automatically collapse excessively quoted
 * blocks and large/redundant signature blocks and hide them entirely from snippet
 * generation.
 *
 * 2) Allow us to reply to messages and provide automatically limited quoting.
 * Specifically, we want to provide one message's worth of context when replying
 * to a message.  We also want to avoid messages in a thread indefinitely
 * growing in size because all users keep replying and leaving default quoting
 * intact.
 *
 *
 **/

define('mailapi/quotechew',
  [
    'exports'
  ],
  function(
    exports
  ) {

////////////////////////////////////////////////////////////////////////////////
// Content Type Encoding
//
// We encode content type values as integers in an attempt to have the serialized
// form not be super huge and be pretty quick to check without generating garbage
// objects.
//
// The low-order nibble encodes the type for styling purposes; everything above
// that nibble is per-type and may encode integer values or use hot bits to
// indicate type.

/**
 * Actual content of the message written by the user.
 */
var CT_AUTHORED_CONTENT = 0x1;
/**
 * Niceties like greetings/thanking someone/etc.  These are things that we want to
 * show when displaying the message, but that arguably are of lower importance and
 * might want to be elided for snippet purposes, etc.
 */
var CT_AUTHORED_NICETIES = 0x11;
/**
 * The signature of the message author; might contain useful information in it.
 */
var CT_SIGNATURE = 0x2;

/**
 * The line that says "Blah wrote:" that precedes a quote.  It's not part of the
 * user content, but it's also not part of the quote.
 */
var CT_LEADIN_TO_QUOTE = 0x3;

var CT_QUOTED_TYPE = 0x4;

/**
 * A quoted reply; eligible for collapsing.  Depth of quoting will also be
 * encoded in the actual integer value.
 */
var CT_QUOTED_REPLY = 0x14;
/**
 * A quoted forwarded message; we would guess that the user has not previously seen
 * the message and the quote wants to be displayed.
 */
var CT_QUOTED_FORWARD = 0x24;
/**
 * Quoted content that has not been pruned.  Aspirational!
 */
var CT_QUOTED_IN_ENTIRETY = 0x40;
/**
 * The quote has been subjected to some level of manual intervention. Aspirational!
 */
var CT_QUOTED_GARDENED = 0x80;

var CT_QUOTE_DEPTH_MASK = 0xff00;

/**
 * Legal-ish boilerplate about how it's only for the recipient, etc. etc.
 * Generally going to be long and boring.
 */
var CT_BOILERPLATE_DISCLAIMER = 0x5;
/**
 * Boilerplate about the message coming from a mailing list, info about the
 * mailing list.
 */
var CT_BOILERPLATE_LIST_INFO = 0x6;
/**
 * Product branding boilerplate that may or may not indicate that the composing
 * device was a mobile device (which is useful).
 */
var CT_BOILERPLATE_PRODUCT = 0x7;
/**
 * Advertising automatically inserted by the mailing list or free e-mailing service,
 * etc.  This is assumed to be boring.
 */
var CT_BOILERPLATE_ADS = 0x8;

var CHARCODE_GT = ('>').charCodeAt(0),
    CHARCODE_SPACE = (' ').charCodeAt(0),
    CHARCODE_NBSP = ('\xa0').charCodeAt(0),
    CHARCODE_NEWLINE = ('\n').charCodeAt(0);

var RE_ORIG_MESAGE_DELIM = /^-{5} Original Message -{5}$/;

var RE_ALL_WS = /^\s+$/;

var RE_SECTION_DELIM = /^[_-]{6,}$/;

var RE_LIST_BOILER = /mailing list$/;

var RE_WROTE_LINE = /wrote/;

var RE_SIGNATURE_LINE = /^-- $/;

/**
 * The maximum number of lines that can be in a boilerplate chunk.  We expect
 * disclaimer boilerplate to be what drives this.
 */
var MAX_BOILERPLATE_LINES = 20;

/**
 * Catch various common well-known product branding lines:
 * - "Sent from my iPhone/iPad/mobile device".  Apple, others.
 * - "Sent from my Android ...".  Common prefix for wildly varying Android
 *     strings.
 * - "Sent from my ...".  And there are others that don't match the above but
 *     that match the prefix.
 * - "Sent from Mobile"
 */
var RE_PRODUCT_BOILER = /^(?:Sent from (?:Mobile|my .+))$/;

var RE_LEGAL_BOILER_START = /^(?:This message|Este mensaje)/;

function indexOfDefault(string, search, startIndex, defVal) {
  var idx = string.indexOf(search, startIndex);
  if (idx === -1)
    return defVal;
  return idx;
}

var NEWLINE = '\n', RE_NEWLINE = /\n/g;

function countNewlinesInRegion(string, startIndex, endIndex) {
  var idx = startIndex - 1, count = 0;
  for (;;) {
    idx = string.indexOf(NEWLINE, idx + 1);
    if (idx === -1 || idx >= endIndex)
      return count;
    count++;
  }
  return null;
}

/**
 * Process the contents of a text body for quoting purposes.
 *
 * Key behaviors:
 *
 * - Whitespace is trimmed at the boundaries of regions.  Our CSS styling will
 *   take care of making sure there is appropriate whitespace.  This is an
 *   intentional normalization that should cover both people who fail to put
 *   whitespace in their messages (jerks) and people who put whitespace in.
 *
 * - Newlines are maintained inside of blocks.
 *
 * - We look backwards for boilerplate blocks once we encounter the first quote
 *   block or the end of the message.  We keep incrementally looking backwards
 *   until we reach something that we don't think is boilerplate.
 */
exports.quoteProcessTextBody = function quoteProcessTextBody(fullBodyText) {
  var contentRep = [];
  var line;
  /**
   * Count the number of '>' quoting characters in the line, mutating `line` to
   * not include the quoting characters.  Some clients will place a single space
   * between each '>' at higher depths, and we support that.  But any more spaces
   * than that and we decide we've reached the end of the quote marker.
   */
  function countQuoteDepthAndNormalize() {
    // We know that the first character is a '>' already.
    var count = 1;
    var lastStartOffset = 1, spaceOk = true;

    for (var i = 1; i < line.length; i++) {
      var c = line.charCodeAt(i);
      if (c === CHARCODE_GT) {
        count++;
        lastStartOffset++;
        spaceOk = true;
      }
      else if (c === CHARCODE_SPACE) {
        if (!spaceOk)
          break;
        lastStartOffset++;
        spaceOk = false;
      }
      else {
        break;
      }
    }
    if (lastStartOffset)
      line = line.substring(lastStartOffset);
    return count;
  }

  /**
   * Scan backwards line-by-line through a chunk of text looking for boilerplate
   * chunks.  We can stop once we determine we're not in boilerplate.
   *
   * - Product blurbs must be the first non-whitespace line seen to be detected;
   *   they do not have to be delimited by an ASCII line.
   *
   * - Legal boilerplate must be delimited by an ASCII line.
   */
  function lookBackwardsForBoilerplate(chunk) {
    var idxLineStart, idxLineEnd, line,
        idxRegionEnd = chunk.length,
        scanLinesLeft = MAX_BOILERPLATE_LINES,
        sawNonWhitespaceLine = false,
        lastContentLine = null,
        lastBoilerplateStart = null,
        sawProduct = false,
        insertAt = contentRep.length;

    function pushBoilerplate(contentType, merge) {
      var boilerChunk = chunk.substring(idxLineStart, idxRegionEnd);
      var idxChunkEnd = idxLineStart - 1;
      // We used to do a trimRight here, but that would eat spaces in addition
      // to newlines.  This was undesirable for both roundtripping purposes and
      // mainly because the "-- " signature marker has a significant space
      // character on the end there.
      while (chunk.charCodeAt(idxChunkEnd - 1) === CHARCODE_NEWLINE) {
        idxChunkEnd--;
      }
      var newChunk = chunk.substring(0, idxChunkEnd);
      var ate = countNewlinesInRegion(chunk, newChunk.length, idxLineStart - 1);
      chunk = newChunk;
      idxRegionEnd = chunk.length;

      if (!merge) {
        contentRep.splice(insertAt, 0,
                          ((ate&0xff) << 8) | contentType,
                          boilerChunk);
      }
      else {
        // nb: this merge does not properly reuse the previous existing 'ate'
        // value; if we start doing more complex merges, the hardcoded '\n'
        // below will need to be computed.
        contentRep[insertAt] = ((ate&0xff) << 8) | (contentRep[insertAt]&0xff);
        contentRep[insertAt + 1] = boilerChunk + '\n' +
                                     contentRep[insertAt + 1];
      }

      sawNonWhitespaceLine = false;
      scanLinesLeft = MAX_BOILERPLATE_LINES;
      lastContentLine = null;
      lastBoilerplateStart = idxLineStart;
    }

    for (idxLineStart = chunk.lastIndexOf('\n') + 1,
           idxLineEnd = chunk.length;
         idxLineEnd > 0 && scanLinesLeft;
         idxLineEnd = idxLineStart - 1,
           idxLineStart = chunk.lastIndexOf('\n', idxLineEnd - 1) + 1,
           scanLinesLeft--) {

      // (do not include the newline character)
      line = chunk.substring(idxLineStart, idxLineEnd);

      // - Skip whitespace lines.
      if (!line.length ||
          (line.length === 1 && line.charCodeAt(0) === CHARCODE_NBSP))
        continue;

      // - Explicit signature demarcation
      if (RE_SIGNATURE_LINE.test(line)) {
        // Check if this is just tagging something we decided was boilerplate in
        // a proper signature wrapper.  If so, then execute a boilerplate merge.
        if (idxLineEnd + 1 === lastBoilerplateStart) {
          pushBoilerplate(null, true);
        }
        else {
          pushBoilerplate(CT_SIGNATURE);
        }
        continue;
      }

      // - Section delimiter; try and classify what lives in this section
      if (RE_SECTION_DELIM.test(line)) {
        if (lastContentLine) {
          // - Look for a legal disclaimer sequentially following the line.
          if (RE_LEGAL_BOILER_START.test(lastContentLine)) {
            pushBoilerplate(CT_BOILERPLATE_DISCLAIMER);
            continue;
          }
          // - Look for mailing list
          if (RE_LIST_BOILER.test(lastContentLine)) {
            pushBoilerplate(CT_BOILERPLATE_LIST_INFO);
            continue;
          }
        }
        // The section was not boilerplate, so thus ends the reign of
        // boilerplate.  Bail.
        return chunk;
      }
      // - A line with content!
      if (!sawNonWhitespaceLine) {
        // - Product boilerplate (must be first/only non-whitespace line)
        if (!sawProduct && RE_PRODUCT_BOILER.test(line)) {
          pushBoilerplate(CT_BOILERPLATE_PRODUCT);
          sawProduct = true;
          continue;
        }
        sawNonWhitespaceLine = true;
      }
      lastContentLine = line;
    }

    return chunk;
  }

  /**
   * Assume that we are in a content region and that all variables are proper.
   */
  function pushContent(considerForBoilerplate, upToPoint, forcePostLine) {
    if (idxRegionStart === null) {
      if (atePreLines) {
        // decrement atePreLines if we are not the first chunk because then we get
        // an implicit/free newline.
        if (contentRep.length)
          atePreLines--;
        contentRep.push((atePreLines&0xff) << 8 | CT_AUTHORED_CONTENT);
        contentRep.push('');
      }
    }
    else {
      if (upToPoint === undefined)
        upToPoint = idxLineStart;

      var chunk = fullBodyText.substring(idxRegionStart,
                                         idxLastNonWhitespaceLineEnd);
      var atePostLines = forcePostLine ? 1 : 0;
      if (idxLastNonWhitespaceLineEnd + 1 !== upToPoint) {
        // We want to count the number of newlines after the newline that
        // belongs to the last non-meaningful-whitespace line up to the
        // effective point.  If we saw a lead-in, the effective point is
        // preceding the lead-in line's newline.  Otherwise it is the start point
        // of the current line.
        atePostLines += countNewlinesInRegion(fullBodyText,
                                              idxLastNonWhitespaceLineEnd + 1,
                                              upToPoint);
      }
      contentRep.push(((atePreLines&0xff) << 8) | ((atePostLines&0xff) << 16) |
                      CT_AUTHORED_CONTENT);
      var iChunk = contentRep.push(chunk) - 1;

      if (considerForBoilerplate) {
        var newChunk = lookBackwardsForBoilerplate(chunk);
        if (chunk.length !== newChunk.length) {
          // Propagate any atePost lines.
          if (atePostLines) {
            var iLastMeta = contentRep.length - 2;
            // We can blindly write post-lines since boilerplate currently
            // doesn't infer any post-newlines on its own.
            contentRep[iLastMeta] = ((atePostLines&0xff) << 16) |
                                    contentRep[iLastMeta];
            contentRep[iChunk - 1] = ((atePreLines&0xff) << 8) |
                                     CT_AUTHORED_CONTENT;
          }

          // If we completely processed the chunk into boilerplate, then we can
          // remove it after propagating any pre-eat amount.
          if (!newChunk.length) {
            if (atePreLines) {
              var bpAte = (contentRep[iChunk + 1] >> 8)&0xff;
              bpAte += atePreLines;
              contentRep[iChunk + 1] = ((bpAte&0xff) << 8) |
                                       (contentRep[iChunk + 1]&0xffff00ff);
            }
            contentRep.splice(iChunk - 1, 2);
          }
          else {
            contentRep[iChunk] = newChunk;
          }
        }
      }
    }

    atePreLines = 0;
    idxRegionStart = null;
    lastNonWhitespaceLine = null;
    idxLastNonWhitespaceLineEnd = null;
    idxPrevLastNonWhitespaceLineEnd = null;
  }

  function pushQuote(newQuoteDepth) {
    var atePostLines = 0;
    // Discard empty lines at the end.  We already skipped adding blank lines, so
    // no need to do the front side.
    while (quoteRunLines.length &&
           !quoteRunLines[quoteRunLines.length - 1]) {
      quoteRunLines.pop();
      atePostLines++;
    }
    contentRep.push(((atePostLines&0xff) << 24) |
                    ((ateQuoteLines&0xff) << 16) |
                    ((inQuoteDepth - 1) << 8) |
                    CT_QUOTED_REPLY);
    contentRep.push(quoteRunLines.join('\n'));
    inQuoteDepth = newQuoteDepth;
    if (inQuoteDepth)
      quoteRunLines = [];
    else
      quoteRunLines = null;

    ateQuoteLines = 0;
    generatedQuoteBlock = true;
  }

  // == On indices and newlines
  // Our line ends always point at the newline for the line; for the last line
  // in the body, there may be no newline, but that doesn't matter since substring
  // is fine with us asking for more than it has.


  var idxLineStart, idxLineEnd, bodyLength = fullBodyText.length,
      // null means we are looking for a non-whitespace line.
      idxRegionStart = null,
      curRegionType = null,
      lastNonWhitespaceLine = null,
      // The index of the last non-purely whitespace line.
      idxLastNonWhitespaceLineEnd = null,
      // value of idxLastNonWhitespaceLineEnd prior to its current value
      idxPrevLastNonWhitespaceLineEnd = null,
      //
      inQuoteDepth = 0,
      quoteRunLines = null,
      contentType = null,
      generatedQuoteBlock = false,
      atePreLines = 0, ateQuoteLines = 0;
  for (idxLineStart = 0,
         idxLineEnd = indexOfDefault(fullBodyText, '\n', idxLineStart,
                                     fullBodyText.length);
       idxLineStart < bodyLength;
       idxLineStart = idxLineEnd + 1,
         idxLineEnd = indexOfDefault(fullBodyText, '\n', idxLineStart,
                                     fullBodyText.length)) {

    line = fullBodyText.substring(idxLineStart, idxLineEnd);

    // - Do not process purely whitespace lines.
    // Because our content runs are treated as regions, ignoring whitespace
    // lines simply means that we don't start or end content blocks on blank
    // lines.  Blank lines in the middle of a content block are maintained
    // because our slice will include them.
    if (!line.length ||
        (line.length === 1
         && line.charCodeAt(0) === CHARCODE_NBSP)) {
      if (inQuoteDepth)
        pushQuote(0);
      if (idxRegionStart === null)
        atePreLines++;
      continue;
    }

    if (line.charCodeAt(0) === CHARCODE_GT) {
      var lineDepth = countQuoteDepthAndNormalize();
      // We are transitioning into a quote state...
      if (!inQuoteDepth) {
        // - Check for a "Blah wrote:" content line
        if (lastNonWhitespaceLine &&
            RE_WROTE_LINE.test(lastNonWhitespaceLine)) {

          // count the newlines up to the lead-in's newline
          var upToPoint = idxLastNonWhitespaceLineEnd;
          idxLastNonWhitespaceLineEnd = idxPrevLastNonWhitespaceLineEnd;
          // Nuke the content region if the lead-in was the start of the region;
          // this can be inferred by there being no prior content line.
          if (idxLastNonWhitespaceLineEnd === null)
            idxRegionStart = null;

          var leadin = lastNonWhitespaceLine;
          pushContent(!generatedQuoteBlock, upToPoint);
          var leadinNewlines = 0;
          if (upToPoint + 1 !== idxLineStart)
            leadinNewlines = countNewlinesInRegion(fullBodyText,
                                                   upToPoint + 1, idxLineStart);
          contentRep.push((leadinNewlines << 8) | CT_LEADIN_TO_QUOTE);
          contentRep.push(leadin);
        }
        else {
          pushContent(!generatedQuoteBlock);
        }
        quoteRunLines = [];
        inQuoteDepth = lineDepth;
      }
      // There is a change in quote depth
      else if (lineDepth !== inQuoteDepth) {
        pushQuote(lineDepth);
      }

      // Eat whitespace lines until we get a non-whitespace (quoted) line.
      if (quoteRunLines.length || line.length)
        quoteRunLines.push(line);
      else
        ateQuoteLines++;
    }
    else {
      if (inQuoteDepth) {
        pushQuote(0);
        idxLastNonWhitespaceLineEnd = null;
      }
      if (idxRegionStart === null)
        idxRegionStart = idxLineStart;

      lastNonWhitespaceLine = line;
      idxPrevLastNonWhitespaceLineEnd = idxLastNonWhitespaceLineEnd;
      idxLastNonWhitespaceLineEnd = idxLineEnd;
    }
  }
  if (inQuoteDepth) {
    pushQuote(0);
  }
  else {
    // There is no implicit newline for the final block, so force it if we had
    // a newline.
    pushContent(true, fullBodyText.length,
                (fullBodyText.charCodeAt(fullBodyText.length - 1) ===
                  CHARCODE_NEWLINE));
  }

  return contentRep;
};

/**
 * The maximum number of characters to shrink the snippet to try and find a
 * whitespace boundary.  If it would take more characters than this, we just
 * do a hard truncation and hope things work out visually.
 */
var MAX_WORD_SHRINK = 8;

var RE_NORMALIZE_WHITESPACE = /\s+/g;

/**
 * Derive the snippet for a message from its processed body representation.  We
 * take the snippet from the first non-empty content block, normalizing
 * all whitespace to a single space character for each instance, then truncate
 * with a minor attempt to align on word boundaries.
 */
exports.generateSnippet = function generateSnippet(rep, desiredLength) {
  for (var i = 0; i < rep.length; i += 2) {
    var etype = rep[i]&0xf, block = rep[i + 1];
    switch (etype) {
      case CT_AUTHORED_CONTENT:
        if (!block.length)
          break;
        // - truncate
        // (no need to truncate if short)
        if (block.length < desiredLength)
          return block.trim().replace(RE_NORMALIZE_WHITESPACE, ' ');
        // try and truncate on a whitespace boundary
        var idxPrevSpace = block.lastIndexOf(' ', desiredLength);
        if (desiredLength - idxPrevSpace < MAX_WORD_SHRINK)
          return block.substring(0, idxPrevSpace).trim()
                      .replace(RE_NORMALIZE_WHITESPACE, ' ');
        return block.substring(0, desiredLength).trim()
                    .replace(RE_NORMALIZE_WHITESPACE, ' ');
    }
  }

  return '';
};

/**
 * What is the deepest quoting level that we should repeat?  Our goal is not to be
 * the arbiter of style, but to provide a way to bound message growth in the face
 * of reply styles where humans do not manually edit quotes.
 *
 * We accept depth levels up to 5 mainly because a quick perusal of mozilla lists
 * shows cases where 5 levels of nesting were used to provide useful context.
 */
var MAX_QUOTE_REPEAT_DEPTH = 5;
// we include a few more than we need for forwarded text regeneration
var replyQuotePrefixStrings = [
  '> ', '>> ', '>>> ', '>>>> ', '>>>>> ', '>>>>>> ', '>>>>>>> ', '>>>>>>>> ',
  '>>>>>>>>> ',
];
var replyQuotePrefixStringsNoSpace = [
  '>', '>>', '>>>', '>>>>', '>>>>>', '>>>>>>', '>>>>>>>', '>>>>>>>>',
  '>>>>>>>>>',
];
var replyQuoteNewlineReplaceStrings = [
  '\n> ', '\n>> ', '\n>>> ', '\n>>>> ', '\n>>>>> ', '\n>>>>>> ', '\n>>>>>>> ',
  '\n>>>>>>>> ',
];
var replyQuoteNewlineReplaceStringsNoSpace = [
  '\n>', '\n>>', '\n>>>', '\n>>>>', '\n>>>>>', '\n>>>>>>', '\n>>>>>>>',
  '\n>>>>>>>>',
];
var replyPrefix = '> ', replyNewlineReplace = '\n> ';

function expandQuotedPrefix(s, depth) {
  if (s.charCodeAt(0) === CHARCODE_NEWLINE)
    return replyQuotePrefixStringsNoSpace[depth];
  return replyQuotePrefixStrings[depth];
}

/**
 * Expand a quoted block so that it has the right number of greater than signs
 * and inserted whitespace where appropriate.  (Blank lines don't want
 * whitespace injected.)
 */
function expandQuoted(s, depth) {
  var ws = replyQuoteNewlineReplaceStrings[depth],
      nows = replyQuoteNewlineReplaceStringsNoSpace[depth];
  return s.replace(RE_NEWLINE, function(m, idx) {
    if (s.charCodeAt(idx+1) === CHARCODE_NEWLINE)
      return nows;
    else
      return ws;
  });
}

/**
 * Generate a text message reply given an already quote-processed body.  We do
 * not simply '>'-prefix everything because 1) we don't store the raw message
 * text because it's faster for us to not quote-process everything every time we
 * display a message, 2) we want to strip some stuff out, 3) we don't care about
 * providing a verbatim quote.
 */
exports.generateReplyText = function generateReplyText(rep) {
  var strBits = [];
  for (var i = 0; i < rep.length; i += 2) {
    var etype = rep[i]&0xf, block = rep[i + 1];
    switch (etype) {
      case CT_AUTHORED_CONTENT:
      case CT_SIGNATURE:
      case CT_LEADIN_TO_QUOTE:
        strBits.push(expandQuotedPrefix(block, 0));
        strBits.push(expandQuoted(block, 0));
        break;
      case CT_QUOTED_TYPE:
        var depth = ((rep[i] >> 8)&0xff) + 1;
        if (depth < MAX_QUOTE_REPEAT_DEPTH) {
          strBits.push(expandQuotedPrefix(block, depth));
          strBits.push(expandQuoted(block, depth));
        }
        break;
      // -- eat boilerplate!
      // No one needs to read boilerplate in a reply; the point is to
      // provide context, not the whole message.  (Forward the message if
      // you want the whole thing!)
      case CT_BOILERPLATE_DISCLAIMER:
      case CT_BOILERPLATE_LIST_INFO:
      case CT_BOILERPLATE_PRODUCT:
      case CT_BOILERPLATE_ADS:
        break;
    }
  }

  return strBits.join('');
};

/**
 * Regenerate the text of a message for forwarding.  'Original Message' is not
 * prepended and information about the message's header is not prepended.  That
 * is done in `generateForwardMessage`.
 *
 * We attempt to generate a message as close to the original message as
 * possible, but it doesn't have to be 100%.
 */
exports.generateForwardBodyText = function generateForwardBodyText(rep) {
  var strBits = [], nl;

  for (var i = 0; i < rep.length; i += 2) {
    if (i)
      strBits.push(NEWLINE);

    var etype = rep[i]&0xf, block = rep[i + 1];
    switch (etype) {
      // - injected with restored whitespace
      case CT_AUTHORED_CONTENT:
        // pre-newlines
        for (nl = (rep[i] >> 8)&0xff; nl; nl--)
          strBits.push(NEWLINE);
        strBits.push(block);
        // post new-lines
        for (nl = (rep[i] >> 16)&0xff; nl; nl--)
          strBits.push(NEWLINE);
        break;
      case CT_LEADIN_TO_QUOTE:
        strBits.push(block);
        for (nl = (rep[i] >> 8)&0xff; nl; nl--)
          strBits.push(NEWLINE);
        break;
      // - injected verbatim,
      case CT_SIGNATURE:
      case CT_BOILERPLATE_DISCLAIMER:
      case CT_BOILERPLATE_LIST_INFO:
      case CT_BOILERPLATE_PRODUCT:
      case CT_BOILERPLATE_ADS:
        for (nl = (rep[i] >> 8)&0xff; nl; nl--)
          strBits.push(NEWLINE);
        strBits.push(block);
        for (nl = (rep[i] >> 16)&0xff; nl; nl--)
          strBits.push(NEWLINE);
        break;
      // - quote character reconstruction
      // this is not guaranteed to round-trip since we assume the non-whitespace
      // variant...
      case CT_QUOTED_TYPE:
        var depth = Math.min((rep[i] >> 8)&0xff, 8);
        for (nl = (rep[i] >> 16)&0xff; nl; nl--) {
          strBits.push(replyQuotePrefixStringsNoSpace[depth]);
          strBits.push(NEWLINE);
        }
        strBits.push(expandQuotedPrefix(block, depth));
        strBits.push(expandQuoted(block, depth));
        for (nl = (rep[i] >> 24)&0xff; nl; nl--) {
          strBits.push(NEWLINE);
          strBits.push(replyQuotePrefixStringsNoSpace[depth]);
        }
        break;
    }
  }

  return strBits.join('');
};

}); // end define
;
// UMD boilerplate to work across node/AMD/naked browser:
// https://github.com/umdjs/umd
(function (root, factory) {
    if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define('bleach',factory);
    } else {
        // Browser globals
        root.Bleach = factory();
    }
}(this, function () {

var ALLOWED_TAGS = [
    'a',
    'abbr',
    'acronym',
    'b',
    'blockquote',
    'code',
    'em',
    'i',
    'li',
    'ol',
    'strong',
    'ul'
];
var ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title'],
    'abbr': ['title'],
    'acronym': ['title']
};
var ALLOWED_STYLES = [];

var Node = {
  ELEMENT_NODE                :  1,
  ATTRIBUTE_NODE              :  2,
  TEXT_NODE                   :  3,
  CDATA_SECTION_NODE          :  4,
  ENTITY_REFERENCE_NODE       :  5,
  ENTITY_NODE                 :  6,
  PROCESSING_INSTRUCTION_NODE :  7,
  COMMENT_NODE                :  8,
  DOCUMENT_NODE               :  9,
  DOCUMENT_TYPE_NODE          : 10,
  DOCUMENT_FRAGMENT_NODE      : 11,
  NOTATION_NODE               : 12
};

var DEFAULTS = {
  tags: ALLOWED_TAGS,
  prune: [],
  attributes: ALLOWED_ATTRIBUTES,
  styles: ALLOWED_STYLES,
  strip: false,
  stripComments: true
};

var bleach = {};

/**
 * Clean a string.
 */
bleach.clean = function (html, opts) {
  if (!html) return '';

  // This is poor's man doctype/meta cleanup. I wish DOMParser works in a
  // worker but it sounds like a dream, see bug 677123.
  // Someone needs to come with a better approach but I'm running out of
  // time...
  html = html.replace(/^\s*<!DOCTYPE.+?>/g, '');

  return bleach.cleanNode(html, opts);
};


/**
 */
bleach.cleanNode = function(html, opts) {
try {
  function debug(str) {
    console.log("Bleach: " + str + "\n");
  }

  opts = opts || DEFAULTS;

  var attrsByTag = opts.hasOwnProperty('attributes') ?
                    opts.attributes : DEFAULTS.attributes;
  var wildAttrs;
  if (Array.isArray(attrsByTag)) {
    wildAttrs = attrsByTag;
    attrsByTag = {};
  } else if (attrsByTag.hasOwnProperty('*')) {
    wildAttrs = attrsByTag['*'];
  } else {
    wildAttrs = [];
  }
  var sanitizeOptions = {
    ignoreComment: ('stripComments' in opts) ? opts.stripComments
                                             : DEFAULTS.stripComments,
    allowedStyles: opts.styles || DEFAULTS.styles,
    allowedTags: opts.tags || DEFAULTS.tags,
    stripMode: ('strip' in opts) ? opts.strip : DEFAULTS.strip,
    pruneTags: opts.prune || DEFAULTS.prune,
    allowedAttributesByTag: attrsByTag,
    wildAttributes: wildAttrs,
    callbackRegexp: opts.callbackRegexp || null,
    callback: opts.callbackRegexp && opts.callback || null,
  };

  var sanitizer = new HTMLSanitizer(sanitizeOptions);
  HTMLParser.HTMLParser(html, sanitizer);
  return sanitizer.output;
} catch(e) {
  console.error(e, '\n', e.stack);
  throw e;
}

/*
*/
};


var RE_NORMALIZE_WHITESPACE = /\s+/g;

/**
 * Returns a text snippet from an HTML string.
 */
bleach.generateSnippet = function (html, desiredLength) {
  try {
    var sanitizer = new SnippetSanitizer(desiredLength);
    HTMLParser.HTMLParser(html, sanitizer);
  } catch(e) {
    dump("Error: " + e + "\n");
  }

  return sanitizer.output;
};


var SnippetSanitizer = function(maxLength) {
  this.output = '';
  this.ignoreText = false;
  this.maxLength = maxLength;
};

SnippetSanitizer.prototype = {
  start: function(tag, attrs, unary) {
    if (unary)
      return;

    if (tag == 'blockquote' || tag == 'style') {
      this.ignoreText++;
    }
  },

  end: function(tag) {
    if (tag == 'blockquote' || tag == 'style') {
      this.ignoreText--;
    }
  },

  chars: function(text) {
    if (this.ignoreText)
      return;

    // the whitespace down to one whitespace character.
    var normalizedText = text.replace(RE_NORMALIZE_WHITESPACE, ' ');

    // If the join would create two adjacents spaces, then skip the one
    // on the thing we are concatenating.
    var length = this.output.length;
    if (length && normalizedText[0] === ' ' && this.output[length - 1] === ' ')
      normalizedText = normalizedText.substring(1);

    this.output += normalizedText;
    if (this.output.length >= this.maxLength) {
      this.output = this.output.substring(0, this.maxLength);
      // XXX We got the right numbers of chars, let's exit brutally from
      // the parser in order to avoid spending all our life in it.
      // Obviously we should do better...
      throw new Error("");
    }
  },

  comments: function(comment) {
    // Nobody care about comments here...
  }
}



var HTMLSanitizer = function(options) {
  this.output = '';

  this.ignoreComment = options.ignoreComment;
  this.allowedStyles = options.allowedStyles;
  this.allowedTags = options.allowedTags;
  this.stripMode = options.stripMode;
  this.pruneTags = options.pruneTags;
  this.allowedAttributesByTag = options.allowedAttributesByTag;
  this.wildAttributes = options.wildAttributes;
  this.ignoreText = options.ignoreText;

  this.callbackRegexp = options.callbackRegexp;
  this.callback = options.callback;

  this.isInsideStyleTag = false;
  // How many pruned tag types are on the stack; we require them to be fully
  // balanced, but don't care if what's inside them is balanced or not.
  this.isInsidePrunedTag = 0;
  // Similar; not clear why we need to bother counting for these. debug?
  this.isInsideStrippedTag = 0;
};

HTMLSanitizer.prototype = {
  start: function(tag, attrs, unary) {
    // - prune (trumps all else)
    if (this.pruneTags.indexOf(tag) !== -1) {
      if (!unary)
        this.isInsidePrunedTag++;
      return;
    }
    else if (this.isInsidePrunedTag) {
      return;
    }
    // - strip
    if (this.allowedTags.indexOf(tag) === -1) {
      // In strip mode we discard the tag rather than escaping it.
      if (this.stripMode) {
        if (!unary) {
          this.isInsideStrippedTag++;
        }
        return;
      }

      // The tag is not in the whitelist
      this.output += "&lt;" + (unary ? "/" : "") + tag + "&gt;";
      return;
    }

    this.isInsideStyleTag = (tag == "style" && !unary);

    // If a callback was specified and it matches the tag name, then invoke
    // the callback.  This happens before the attribute filtering so that
    // the function can observe dangerous attributes, but in the event of
    // the (silent) failure of this function, they will still be safely
    // removed.
    var callbackRegexp = this.callbackRegexp;
    if (callbackRegexp && callbackRegexp.test(tag)) {
      attrs = this.callback(tag, attrs);
    }

    var whitelist = this.allowedAttributesByTag[tag];
    var wildAttrs = this.wildAttributes;
    var result = "<" + tag;
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      var attrName = attr.name.toLowerCase();

      if (wildAttrs.indexOf(attrName) !== -1 ||
          (whitelist && whitelist.indexOf(attrName) !== -1)) {
        if (attrName == "style") {
          var attrValue = CSSParser.parseAttribute(attr.escaped,
                                                   this.allowedStyles);
          result += " " + attrName + '="' + attrValue + '"';
        } else {
          result += " " + attrName + '="' + attr.escaped + '"';
        }
      }
    }
    result += (unary ? "/" : "") + ">";

    this.output += result;
  },

  end: function(tag) {
    if (this.pruneTags.indexOf(tag) !== -1) {
      this.isInsidePrunedTag--;
      return;
    }
    else if (this.isInsidePrunedTag) {
      return;
    }

    if (this.allowedTags.indexOf(tag) === -1) {
      if (this.isInsideStrippedTag) {
        this.isInsideStrippedTag--;
        return;
      }

      this.output += "&lt;/" + tag + "&gt;";
      return;
    }

    if (this.isInsideStyleTag) {
      this.isInsideStyleTag = false;
    }

    this.output += "</" + tag + ">";
  },

  chars: function(text) {
    if (this.isInsidePrunedTag)
      return;
    if (this.isInsideStyleTag) {
      this.output += CSSParser.parseBody(text, this.allowedStyles);
      return;
    }

    this.output += escapeHTMLEntities(text);
  },

  comment: function(comment) {
    if (this.isInsidePrunedTag)
      return;
    if (this.ignoreComment)
      return;
    this.output += '<!--' + comment + '-->';
  }
};

/*
 * HTML Parser By John Resig (ejohn.org)
 * Although the file only calls out MPL as a valid license, the upstream is
 * available under Apache 2.0 and John Resig has indicated by e-mail to
 * asuth@mozilla.com on 2013-03-13 that Apache 2.0 is fine.  So we are using
 * it under Apache 2.0.
 * http://ejohn.org/blog/pure-javascript-html-parser/
 *
 * Original code by Erik Arvidsson, tri-licensed under Apache 2.0, MPL 1.1
 * (probably implicitly 1.1+), or GPL 2.0+ (as visible in the file):
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 *
 * // Use like so:
 * HTMLParser(htmlString, {
 *     start: function(tag, attrs, unary) {},
 *     end: function(tag) {},
 *     chars: function(text) {},
 *     comment: function(text) {}
 * });
 *
 */


var HTMLParser = (function(){
  // Important syntax notes from the WHATWG HTML spec and observations.
  // http://www.whatwg.org/specs/web-apps/current-work/multipage/syntax.html
  // http://www.whatwg.org/specs/web-apps/current-work/multipage/common-microsyntaxes.html#common-parser-idioms
  //
  // The spec says _html_ tag names are [A-Za-z0-9]; we also include '-' and '_'
  // because that's what the code already did, but also since Gecko seems to be
  // very happy to parse those characters.
  //
  // The spec defines attributes by what they must not include, which is:
  // [\0\s"'>/=] plus also no control characters, or non-unicode characters.
  // But we currently use the same regexp as we use for tags because that's what
  // the code was using already.
  //
  // CDATA *is not a thing* in the HTML namespace.  <![CDATA[ just gets treated
  // as a "bogus comment".  See:
  // http://www.whatwg.org/specs/web-apps/current-work/multipage/tokenization.html#markup-declaration-open-state

  // NOTE: tag and attr regexps changed to ignore name spaces prefixes!  via
  // - Regular Expressions for parsing tags and attributes
  // ^<                     anchored tag open character
  // (?:[-A-Za-z0-9_]+:)?   eat the namespace
  // ([-A-Za-z0-9_]+)       the tag name
  // (                      repeated attributes:
  //  (?:
  //   \s+                  Mandatory whitespace between attribute names
  //   (?:[-A-Za-z0-9_]+:)? optional attribute prefix
  //   [-A-Za-z0-9_]+       attribute name
  //   (?:                  The attribute doesn't need a value
  //    \s*=\s*             whitespace, = to indicate value, whitespace
  //    (?:                 attribute values:
  //     (?:"[^"]*")|       double-quoted
  //     (?:'[^']*')|       single-quoted
  //     [^>\s]+            unquoted
  //    )
  //   )?                   (the attribute does't need a value)
  //  )*                    (there can be multiple attributes)
  // )                      (capture the list of attributes)
  // \s*                    optional whitespace before the tag closer
  // (\/?)                  optional self-closing character
  // >                      tag close character
  var startTag = /^<(?:[-A-Za-z0-9_]+:)?([-A-Za-z0-9_]+)((?:\s+(?:[-A-Za-z0-9_]+:)?[-A-Za-z0-9_]+(?:\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))?)*)\s*(\/?)>/,
  // ^<\/                   close tag lead-in
  // (?:[-A-Za-z0-9_]+:)?   optional tag prefix
  // ([-A-Za-z0-9_]+)       tag name
  // [^>]*                  The spec says this should be whitespace, we forgive.
  // >
    endTag = /^<\/(?:[-A-Za-z0-9_]+:)?([-A-Za-z0-9_]+)[^>]*>/,
  // NOTE: This regexp was doing something freaky with the value quotings
  // before. (?:"((?:\\.|[^"])*)") instead of (?:"[^"]*") from the tag part,
  // which is deeply confusing.  Since the period thing seems meaningless, I am
  // replacing it from the bits from startTag
  //
  // (?:[-A-Za-z0-9_]+:)?   attribute prefix
  // ([-A-Za-z0-9_]+)       attribute name
  // (?:                    The attribute doesn't need a value
  //  \s*=\s*               whitespace, = to indicate value, whitespace
  //  (?:                   attribute values:
  //   (?:"([^"]*)")|       capture double-quoted
  //   (?:'([^']*)')|       capture single-quoted
  //   ([^>\s]+)            capture unquoted
  //  )
  // )?                    (the attribute does't need a value)
    attr = /(?:[-A-Za-z0-9_]+:)?([-A-Za-z0-9_]+)(?:\s*=\s*(?:(?:"([^"]*)")|(?:'([^']*)')|([^>\s]+)))?/g;

  // - Empty Elements - HTML 4.01
  var empty = makeMap("area,base,basefont,br,col,frame,hr,img,input,isindex,link,meta,param,embed");

  // - Block Elements - HTML 4.01
  var block = makeMap("address,applet,blockquote,button,center,dd,del,dir,div,dl,dt,fieldset,form,frameset,hr,iframe,ins,isindex,li,map,menu,noframes,noscript,object,ol,p,pre,script,table,tbody,td,tfoot,th,thead,tr,ul");

  // - Inline Elements - HTML 4.01
  var inline = makeMap("a,abbr,acronym,applet,b,basefont,bdo,big,br,button,cite,code,del,dfn,em,font,i,iframe,img,input,ins,kbd,label,map,object,q,s,samp,script,select,small,span,strike,strong,sub,sup,textarea,tt,u,var");

  // - Elements that you can, intentionally, leave open (and close themselves)
  var closeSelf = makeMap("colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr");

  // - Attributes that have their values filled in disabled="disabled"
  var fillAttrs = makeMap("checked,compact,declare,defer,disabled,ismap,multiple,nohref,noresize,noshade,nowrap,readonly,selected");

  // - Special Elements (can contain anything)
  var special = makeMap("script,style");

  var HTMLParser = this.HTMLParser = function( html, handler ) {
    var index, chars, match, stack = [], last = html;
    stack.last = function(){
      return this[ this.length - 1 ];
    };

    while ( html ) {
      chars = true;

      // Make sure we're not in a script or style element
      if ( !stack.last() || !special[ stack.last() ] ) {

        // Comment
        if ( html.lastIndexOf("<!--", 0) == 0 ) {
          index = html.indexOf("-->");

                                        // WHATWG spec says the text can't start
                                        // with the closing tag.
          if ( index >= 5 ) {
            if ( handler.comment )
              handler.comment( html.substring( 4, index ) );
            html = html.substring( index + 3 );
            chars = false;
          } else {
            // The comment does not have a end. Let's return the whole string as a comment then.
            if ( handler.comment )
              handler.comment( html.substring( 4, -1 ) );
            html = '';
            chars = false;
          }

        // end tag
        } else if ( html.lastIndexOf("</", 0) == 0 ) {
          match = html.match( endTag );

          if ( match ) {
            html = html.substring( match[0].length );
            match[0].replace( endTag, parseEndTag );
            chars = false;
          }

        // start tag
        } else if ( html.lastIndexOf("<", 0) == 0 ) {
          match = html.match( startTag );

          if ( match ) {
            html = html.substring( match[0].length );
            match[0].replace( startTag, parseStartTag );
            chars = false;
          }
        }

        if ( chars ) {
          index = html.indexOf("<");

          if (index === 0) {
            // This is not a valid tag in regards of the parser.
            var text = html.substring(0, 1);
            html = html.substring(1);
          } else {
            var text = index < 0 ? html : html.substring( 0, index );
            html = index < 0 ? "" : html.substring( index );
          }

          if ( handler.chars )
            handler.chars( text );
        }

      } else { // specials: script or style
        html = html.replace(
          // we use "[^]" instead of "." because it matches newlines too
          new RegExp("^([^]*?)<\/" + stack.last() + "[^>]*>", "i"),
          function(all, text){
            text = text.replace(/<!--([^]*?)-->/g, "$1")
              .replace(/<!\[CDATA\[([^]*?)]]>/g, "$1");

            if ( handler.chars )
              handler.chars( text );

            return "";
          });

        parseEndTag( "", stack.last() );
      }

      if ( html == last ) {
        console.log(html);
        console.log(last);
        throw "Parse Error: " + html;
      }
      last = html;
    }

    // Clean up any remaining tags
    parseEndTag();

    function parseStartTag( tag, tagName, rest, unary ) {
      tagName = tagName.toLowerCase();
      if ( block[ tagName ] ) {
        while ( stack.last() && inline[ stack.last() ] ) {
          parseEndTag( "", stack.last() );
        }
      }

      if ( closeSelf[ tagName ] && stack.last() == tagName ) {
        parseEndTag( "", tagName );
      }

      unary = empty[ tagName ] || !!unary;

      if ( !unary )
        stack.push( tagName );

      if ( handler.start ) {
        var attrs = [];

        rest.replace(attr, function(match, name) {
          // The attr regexp capture groups:
          // 1: attribute name
          // 2: double-quoted attribute value (whitespace allowed inside)
          // 3: single-quoted attribute value (whitespace allowed inside)
          // 4: un-quoted attribute value (whitespace forbidden)
          // We need to escape double-quotes because of the risks in there.
          var value = arguments[2] ? arguments[2] :
            arguments[3] ? arguments[3] :
            arguments[4] ? arguments[4] :
            fillAttrs[name] ? name : "";

          attrs.push({
            name: name,
            value: value,
            escaped: value.replace(/"/g, '&quot;')
          });
        });

        if ( handler.start )
          handler.start( tagName, attrs, unary );
      }
    }

    function parseEndTag( tag, tagName ) {
      // If no tag name is provided, clean shop
      if ( !tagName )
        var pos = 0;

      // Find the closest opened tag of the same type
      else
        for ( var pos = stack.length - 1; pos >= 0; pos-- )
          if ( stack[ pos ] == tagName )
            break;

      if ( pos >= 0 ) {
        // Close all the open elements, up the stack
        for ( var i = stack.length - 1; i >= pos; i-- )
          if ( handler.end )
            handler.end( stack[ i ] );

        // Remove the open elements from the stack
        stack.length = pos;
      }
    }
  };

  function makeMap(str){
    var obj = {}, items = str.split(",");
    for ( var i = 0; i < items.length; i++ )
      obj[ items[i] ] = true;
    return obj;
  }

  return this;
})();

var RE_IS_WS = /^[\s]*$/;

var CSSParser = {
  parseAttribute: function (data, allowedStyles) {
    var attrValue = "";

    var pairs = data.split(";");
    for (var j = 0; j < pairs.length; j++) {
      if (RE_IS_WS.test(pairs[j])) {
        attrValue += pairs[j];
        continue;
      }
      var pair = pairs[j].split(":");

      var key = pair[0].trim();
      if (allowedStyles.indexOf(key) !== -1) {
        attrValue += pair[0] + ":" + pair[1] + ";";
      }
    }

    return attrValue;
  },

  parseBody: function (data, allowedStyles) {
    var body = "";

    var rules = data.split(/}/);
    for (var i = 0; i < rules.length; i++) {
      if (!rules[i].length)
        continue;

      var rule = rules[i].split(/{/);
      var key = rule[0].trim();
      // We only want style rules (type 1).  All other rule types are at-rules
      // and prefixed with an '@' sign.  Specifically, @charset (2), @import
      // (3), @media (4), @font-face (5), @page (6), @keyframes (7, keyframe is
      // 8), (9 is reserved), @namespace (10), @supports (12), @document (13),
      // @font-feature-values (14), @viewport (15), @region (16)
      if (key.length && key[0] === '@')
        continue;
      var value = this.parseAttribute(rule[1], allowedStyles);
      if (value)
        body += rule[0] + '{' + value + '}';
    }

    return body;
  }
};


var entities = {
  34 : 'quot',
  38 : 'amp',
  39 : 'apos',
  60 : 'lt',
  62 : 'gt',
  160 : 'nbsp',
  161 : 'iexcl',
  162 : 'cent',
  163 : 'pound',
  164 : 'curren',
  165 : 'yen',
  166 : 'brvbar',
  167 : 'sect',
  168 : 'uml',
  169 : 'copy',
  170 : 'ordf',
  171 : 'laquo',
  172 : 'not',
  173 : 'shy',
  174 : 'reg',
  175 : 'macr',
  176 : 'deg',
  177 : 'plusmn',
  178 : 'sup2',
  179 : 'sup3',
  180 : 'acute',
  181 : 'micro',
  182 : 'para',
  183 : 'middot',
  184 : 'cedil',
  185 : 'sup1',
  186 : 'ordm',
  187 : 'raquo',
  188 : 'frac14',
  189 : 'frac12',
  190 : 'frac34',
  191 : 'iquest',
  192 : 'Agrave',
  193 : 'Aacute',
  194 : 'Acirc',
  195 : 'Atilde',
  196 : 'Auml',
  197 : 'Aring',
  198 : 'AElig',
  199 : 'Ccedil',
  200 : 'Egrave',
  201 : 'Eacute',
  202 : 'Ecirc',
  203 : 'Euml',
  204 : 'Igrave',
  205 : 'Iacute',
  206 : 'Icirc',
  207 : 'Iuml',
  208 : 'ETH',
  209 : 'Ntilde',
  210 : 'Ograve',
  211 : 'Oacute',
  212 : 'Ocirc',
  213 : 'Otilde',
  214 : 'Ouml',
  215 : 'times',
  216 : 'Oslash',
  217 : 'Ugrave',
  218 : 'Uacute',
  219 : 'Ucirc',
  220 : 'Uuml',
  221 : 'Yacute',
  222 : 'THORN',
  223 : 'szlig',
  224 : 'agrave',
  225 : 'aacute',
  226 : 'acirc',
  227 : 'atilde',
  228 : 'auml',
  229 : 'aring',
  230 : 'aelig',
  231 : 'ccedil',
  232 : 'egrave',
  233 : 'eacute',
  234 : 'ecirc',
  235 : 'euml',
  236 : 'igrave',
  237 : 'iacute',
  238 : 'icirc',
  239 : 'iuml',
  240 : 'eth',
  241 : 'ntilde',
  242 : 'ograve',
  243 : 'oacute',
  244 : 'ocirc',
  245 : 'otilde',
  246 : 'ouml',
  247 : 'divide',
  248 : 'oslash',
  249 : 'ugrave',
  250 : 'uacute',
  251 : 'ucirc',
  252 : 'uuml',
  253 : 'yacute',
  254 : 'thorn',
  255 : 'yuml',
  402 : 'fnof',
  913 : 'Alpha',
  914 : 'Beta',
  915 : 'Gamma',
  916 : 'Delta',
  917 : 'Epsilon',
  918 : 'Zeta',
  919 : 'Eta',
  920 : 'Theta',
  921 : 'Iota',
  922 : 'Kappa',
  923 : 'Lambda',
  924 : 'Mu',
  925 : 'Nu',
  926 : 'Xi',
  927 : 'Omicron',
  928 : 'Pi',
  929 : 'Rho',
  931 : 'Sigma',
  932 : 'Tau',
  933 : 'Upsilon',
  934 : 'Phi',
  935 : 'Chi',
  936 : 'Psi',
  937 : 'Omega',
  945 : 'alpha',
  946 : 'beta',
  947 : 'gamma',
  948 : 'delta',
  949 : 'epsilon',
  950 : 'zeta',
  951 : 'eta',
  952 : 'theta',
  953 : 'iota',
  954 : 'kappa',
  955 : 'lambda',
  956 : 'mu',
  957 : 'nu',
  958 : 'xi',
  959 : 'omicron',
  960 : 'pi',
  961 : 'rho',
  962 : 'sigmaf',
  963 : 'sigma',
  964 : 'tau',
  965 : 'upsilon',
  966 : 'phi',
  967 : 'chi',
  968 : 'psi',
  969 : 'omega',
  977 : 'thetasym',
  978 : 'upsih',
  982 : 'piv',
  8226 : 'bull',
  8230 : 'hellip',
  8242 : 'prime',
  8243 : 'Prime',
  8254 : 'oline',
  8260 : 'frasl',
  8472 : 'weierp',
  8465 : 'image',
  8476 : 'real',
  8482 : 'trade',
  8501 : 'alefsym',
  8592 : 'larr',
  8593 : 'uarr',
  8594 : 'rarr',
  8595 : 'darr',
  8596 : 'harr',
  8629 : 'crarr',
  8656 : 'lArr',
  8657 : 'uArr',
  8658 : 'rArr',
  8659 : 'dArr',
  8660 : 'hArr',
  8704 : 'forall',
  8706 : 'part',
  8707 : 'exist',
  8709 : 'empty',
  8711 : 'nabla',
  8712 : 'isin',
  8713 : 'notin',
  8715 : 'ni',
  8719 : 'prod',
  8721 : 'sum',
  8722 : 'minus',
  8727 : 'lowast',
  8730 : 'radic',
  8733 : 'prop',
  8734 : 'infin',
  8736 : 'ang',
  8743 : 'and',
  8744 : 'or',
  8745 : 'cap',
  8746 : 'cup',
  8747 : 'int',
  8756 : 'there4',
  8764 : 'sim',
  8773 : 'cong',
  8776 : 'asymp',
  8800 : 'ne',
  8801 : 'equiv',
  8804 : 'le',
  8805 : 'ge',
  8834 : 'sub',
  8835 : 'sup',
  8836 : 'nsub',
  8838 : 'sube',
  8839 : 'supe',
  8853 : 'oplus',
  8855 : 'otimes',
  8869 : 'perp',
  8901 : 'sdot',
  8968 : 'lceil',
  8969 : 'rceil',
  8970 : 'lfloor',
  8971 : 'rfloor',
  9001 : 'lang',
  9002 : 'rang',
  9674 : 'loz',
  9824 : 'spades',
  9827 : 'clubs',
  9829 : 'hearts',
  9830 : 'diams',
  338 : 'OElig',
  339 : 'oelig',
  352 : 'Scaron',
  353 : 'scaron',
  376 : 'Yuml',
  710 : 'circ',
  732 : 'tilde',
  8194 : 'ensp',
  8195 : 'emsp',
  8201 : 'thinsp',
  8204 : 'zwnj',
  8205 : 'zwj',
  8206 : 'lrm',
  8207 : 'rlm',
  8211 : 'ndash',
  8212 : 'mdash',
  8216 : 'lsquo',
  8217 : 'rsquo',
  8218 : 'sbquo',
  8220 : 'ldquo',
  8221 : 'rdquo',
  8222 : 'bdquo',
  8224 : 'dagger',
  8225 : 'Dagger',
  8240 : 'permil',
  8249 : 'lsaquo',
  8250 : 'rsaquo',
  8364 : 'euro'
};

function escapeHTMLEntities(text) {
  text = text.replace(/&([a-z]+);/gi, "__IGNORE_ENTITIES_HACK__$1;");
  text = text.replace(/[\u00A0-\u2666<>\&]/g, function(c) {
    return '&' + entities[c.charCodeAt(0)] + ';';
  });
  return text.replace(/__IGNORE_ENTITIES_HACK__([a-z]+);/gi, "&$1;");
};


return bleach;

})); // close out UMD boilerplate
;
/**
 * Process text/html for message body purposes.  Specifically:
 *
 * - sanitize HTML (using bleach.js): discard illegal markup entirely, render
 *   legal but 'regulated' markup inert (ex: links to external content).
 * - TODO: perform normalization of quote markup from different clients into
 *   blockquotes, like how Thunderbird conversations does it.
 * - snippet generation: Try and generate a usable snippet string from something
 *   that is not a quote.
 *
 * We may eventually try and perform more detailed analysis like `quotechew.js`
 * does with structured markup, potentially by calling out to quotechew, but
 * that's a tall order to get right, so it's mightily postponed.
 **/

define('mailapi/htmlchew',
  [
    'exports',
    'bleach'
  ],
  function(
    exports,
    $bleach
  ) {

/**
 * Whitelisted HTML tags list. Currently from nsTreeSanitizer.cpp which credits
 * Mark Pilgrim and Sam Ruby for its own initial whitelist.
 *
 * IMPORTANT THUNDERBIRD NOTE: Thunderbird only engages its sanitization logic
 * when processing mailto URIs, when the non-default
 * "view | message body as | simple html" setting is selected, or when
 * displaying spam messages.  Accordingly, the settings are pretty strict
 * and not particularly thought-out.  Non-CSS presentation is stripped, which
 * is pretty much the lingua franca of e-mail.  (Thunderbird itself generates
 * font tags, for example.)
 *
 * Some things are just not in the list at all:
 * - SVG: Thunderbird nukes these itself because it forces
 *   SanitizerCidEmbedsOnly which causes flattening of everything in the SVG
 *   namespace.
 *
 * Tags that we are opting not to include will be commented with a reason tag:
 * - annoying: This thing is ruled out currently because it only allows annoying
 *   things to happen *given our current capabilities*.
 * - scripty: This thing requires scripting to make anything happen, and we do
 *   not allow scripting.
 * - forms: We have no UI to expose the target of a form right now, so it's
 *   not safe.  Thunderbird displays a scam warning, which isn't realy a big
 *   help, but it's something.  Because forms are largely unsupported or just
 *   broken in many places, they are rarely used, so we are turning them off
 *   entirely.
 * - non-body: previously killed as part of the parse process because we were
 *   assigning to innerHTML rather than creating a document with the string in
 *   it.  We could change this up in a future bug now.
 * - dangerous: The semantics of the tag are intentionally at odds with our
 *   goals and/or are extensible.  (ex: link tag.)  Our callbacks could be
 *   used to only let through okay things.
 * - interactive-ui: A cross between scripty and forms, things like (HTML5)
 *   menu and command imply some type of mutation that requires scripting.
 *   They also are frequently very attribute-heavy.
 * - svg: it's SVG, we don't support it yet!
 */
var LEGAL_TAGS = [
  'a', 'abbr', 'acronym', 'area', 'article', 'aside',
  // annoying: 'audio',
  'b',
  'bdi', 'bdo', // (bidirectional markup stuff)
  'big', 'blockquote',
  // implicitly-nuked: 'body'
  'br',
  // forms: 'button',
  // scripty: canvas
  'caption',
  'center',
  'cite', 'code', 'col', 'colgroup',
  // interactive-ui: 'command',
  // forms: 'datalist',
  'dd', 'del', 'details', 'dfn', 'dir', 'div', 'dl', 'dt',
  'em',
  // forms: 'fieldset' (but allowed by nsTreeSanitizer)
  'figcaption', 'figure',
  'font',
  'footer',
  // forms: 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // non-body: 'head'
  'header', 'hgroup', 'hr',
  // non-body: 'html'
  'i', 'img',
  // forms: 'input',
  'ins', // ("represents a range of text that has been inserted to a document")
  'kbd', // ("The kbd element represents user input")
  'label', 'legend', 'li',
  // dangerous: link (for CSS styles
  /* link supports many types, none of which we want, some of which are
   * risky: http://dev.w3.org/html5/spec/links.html#linkTypes. Specifics:
   * - "stylesheet": This would be okay for cid links, but there's no clear
   *   advantage over inline styles, so we forbid it, especially as supporting
   *   it might encourage other implementations to dangerously support link.
   * - "prefetch": Its whole point is de facto information leakage.
   */
  'listing', // (deprecated, like "pre")
  'map', 'mark',
  // interactive-ui: 'menu', 'meta', 'meter',
  'nav',
  'nobr', // (deprecated "white-space:nowrap" equivalent)
  'noscript',
  'ol',
  // forms: 'optgroup',
  // forms: 'option',
  'output', // (HTML5 draft: "result of a calculation in a form")
  'p', 'pre',
  // interactive-ui: 'progress',
  'q',
  /* http://www.w3.org/TR/ruby/ is a pronounciation markup that is not directly
   * supported by gecko at this time (although there is a Firefox extension).
   * All of 'rp', 'rt', and 'ruby' are ruby tags.  The spec also defines 'rb'
   * and 'rbc' tags that nsTreeSanitizer does not whitelist, however.
   */
  'rp', 'rt', 'ruby',
  's', 'samp', 'section',
  // forms: 'select',
  'small',
  // annoying?: 'source',
  'span', 'strike', 'strong',
  'style',
  'sub', 'summary', 'sup',
  // svg: 'svg', NB: this lives in its own namespace
  'table', 'tbody', 'td',
  // forms: 'textarea',
  'tfoot', 'th', 'thead', 'time',
  'title', // XXX does this mean anything outside head?
  'tr',
  // annoying?: 'track'
  'tt',
  'u', 'ul', 'var',
  // annoying: 'video',
  'wbr' // (HTML5 draft: line break opportunity)
];

/**
 * Tags whose children should be removed along with the tag itself, rather than
 * splicing the children into the position originally occupied by the parent.
 *
 * We do this for:
 * - forms; see `LEGAL_TAGS` for the rationale.  Note that we don't bother
 *   including children that should already be nuked by PRUNE_TAGS.  For
 *   example, 'option' and 'optgroup' only make sense under 'select' or
 *   'datalist', so we need not include them.  This means that if the tags
 *   are used in nonsensical positions, they will have their contents
 *   merged into the document text, but that's not a major concern.
 * - non-body: don't have stuff from the header show up like it's part of the
 *   body!  For now we do want <style> tags to fall out, but we want <title>
 *   to not show up, etc.
 * - 'script': no one wants to read the ignored JS code!
 * Note that bleach.js now is aware of the special nature of 'script' and
 * 'style' tags, so putting them in prune is not strictly required.
 */
var PRUNE_TAGS = [
  'button', // (forms)
  'datalist', // (forms)
  'script', // (script)
  'select', // (forms)
  'svg', // (svg)
  'title', // (non-body)
];

/**
 * What attributes to allow globally and on specific tags.
 *
 * Forbidden marker names:
 * - URL-like: The attribute can contain URL's and we don't care enough to
 *   sanitize the contents right now.
 * - sanitized: We manually do something with the attribute in our processing
 *   logic.
 * - specific: The attribute is explicitly named on the relevant element types.
 * - unsupported: Gecko ignores the attribute and there is no chance of
 *   standardization, so just strip it.
 * - microformat: we can't do anything with microformats right now, save some
 *   space.
 * - awkward: It's not dangerous, but it's not clear how it could have useful
 *   semantics.
 */
var LEGAL_ATTR_MAP = {
  '*': [
    'abbr', // (tables: removed from HTML5)
    // forms: 'accept', 'accept-charset',
    // interactive-ui: 'accesskey',
    // forms: 'action',
    'align', // (pres)
    'alt', // (fallback content)
    // forms: 'autocomplete', 'autofocus',
    // annoying: 'autoplay',
    'axis', // (tables: removed from HTML5)
    // URL-like: 'background',
    'bgcolor', 'border', // (pres)
    'cellpadding', 'cellspacing', // (pres)
    // unsupported: 'char',
    'charoff', // (tables)
    // specific: 'charset'
    // forms, interactive-ui: 'checked',
    // URL-like: 'cite'
    'class', 'clear', 'color', // (pres)
    'cols', 'colspan', // (tables)
    'compact', // (pres)
    // dangerous: 'content', (meta content refresh is bad.)
    // interactive-ui: 'contenteditable', (we already use this ourselves!)
    // interactive-ui: 'contextmenu',
    // annoying: 'controls', (media)
    'coords', // (area image map)
    'datetime', // (ins, del, time semantic markups)
    // forms: 'disabled',
    'dir', // (rtl)
    // interactive-ui: 'draggable',
    // forms: 'enctype',
    'face', // (pres)
    // forms: 'for',
    'frame', // (tables)
    'headers', // (tables)
    'height', // (layout)
    // interactive-ui: 'hidden', 'high',
    // sanitized: 'href',
    // specific: 'hreflang',
    'hspace', // (pres)
    // dangerous: 'http-equiv' (meta refresh, maybe other trickiness)
    // interactive-ui: 'icon',
    'id', // (pres; white-listed for style targets)
    // specific: 'ismap', (area image map)
    // microformat: 'itemid', 'itemprop', 'itemref', 'itemscope', 'itemtype',
    // annoying: 'kind', (media)
    // annoying, forms, interactive-ui: 'label',
    'lang', // (language support)
    // forms: 'list',
    // dangerous: 'longdesc', (link to a long description, html5 removed)
    // annoying: 'loop',
    // interactive-ui: 'low',
    // forms, interactive-ui: 'max',
    // forms: 'maxlength',
    'media', // (media-query for linky things; safe if links are safe)
    // forms: 'method',
    // forms, interactive-ui: 'min',
    // unsupported: 'moz-do-not-send', (thunderbird internal composition)
    // forms: 'multiple',
    // annoying: 'muted',
    // forms, interactive-ui: 'name', (although pretty safe)
    'nohref', // (image maps)
    // forms: 'novalidate',
    'noshade', // (pres)
    'nowrap', // (tables)
    'open', // (for "details" element)
    // interactive-ui: 'optimum',
    // forms: 'pattern', 'placeholder',
    // annoying: 'playbackrate',
    'pointsize', // (pres)
    // annoying:  'poster', 'preload',
    // forms: 'prompt',
    'pubdate', // ("time" element)
    // forms: 'radiogroup', 'readonly',
    // dangerous: 'rel', (link rel, a rel, area rel)
    // forms: 'required',
    // awkward: 'rev' (reverse link; you can't really link to emails)
    'reversed', // (pres? "ol" reverse numbering)
    // interactive-ui: 'role', We don't want a screen reader making the user
    //   think that part of the e-mail is part of the UI.  (WAI-ARIA defines
    //   "accessible rich internet applications", not content markup.)
    'rows', 'rowspan', 'rules', // (tables)
    // sanitized: 'src',
    'size', // (pres)
    'scope', // (tables)
    'scoped', // (pres; on "style" elem)
    // forms: 'selected',
    'shape', // (image maps)
    'span', // (tables)
    // interactive-ui: 'spellcheck',
    // sanitized, dangerous: 'src'
    // annoying: 'srclang',
    'start', // (pres? "ol" numbering)
    'summary', // (tables accessibility)
    'style', // (pres)
    // interactive-ui: 'tabindex',
    // dangerous: 'target', (specifies a browsing context, but our semantics
    //   are extremely clear and don't need help.)
    'title', // (advisory)
    // specific, dangerous: type (various, but mime-type for links is not the
    //   type of thing we would ever want to propagate or potentially deceive
    //   the user with.)
    'valign', // (pres)
    'value', // (pres? "li" override for "ol"; various form uses)
    'vspace', // (pres)
    'width', // (layout)
    // forms: 'wrap',
  ],
  'a': ['ext-href', 'hreflang'],
  'area': ['ext-href', 'hreflang'],
  // these are used by our quoting and Thunderbird's quoting
  'blockquote': ['cite', 'type'],
  'img': ['cid-src', 'ext-src', 'ismap', 'usemap'],
  // This may only end up being used as a debugging thing, but let's let charset
  // through for now.
  'meta': ['charset'],
  'ol': ['type'], // (pres)
  'style': ['type'],
};

/**
 * CSS Style rules to support.
 *
 * nsTreeSanitizer is super lazy about style binding and does not help us out.
 * What it does is nuke all rule types except NAMESPACE (@namespace), FONT_FACE
 * (@font-face), and STYLE rules (actual styling).  This means nuking CHARSET
 * (@charset to specify the encoding of the stylesheet if the server did not
 * provide it), IMPORT (@import to reference other stylesheet files), MEDIA
 * (@media media queries), PAGE (@page page box info for paged media),
 * MOZ_KEYFRAMES, MOZ_KEYFRAME, SUPPORTS (@supports provides support for rules
 * conditioned on browser support, but is at risk.)  The only style directive it
 * nukes is "-moz-binding" which is the XBL magic and considered dangerous.
 *
 * Risks: Anything that takes a url() is dangerous insofar as we need to
 * sanitize the url.  XXX for now we just avoid any style that could potentially
 * hold a URI.
 *
 * Good news: We always cram things into an iframe, so we don't need to worry
 * about clever styling escaping out into our UI.
 *
 * New reasons not to allow:
 * - animation: We don't want or need animated wackiness.
 * - slow: Doing the thing is slow!
 */
var LEGAL_STYLES = [
  // animation: animation*
  // URI-like: background, background-image
  'background-color',
  // NB: border-image is not set by the 'border' aliases
  'border',
  'border-bottom', 'border-bottom-color', 'border-bottom-left-radius',
  'border-bottom-right-radius', 'border-bottom-style', 'border-bottom-width',
  'border-color',
  // URI-like: border-image*
  'border-left', 'border-left-color', 'border-left-style', 'border-left-width',
  'border-radius',
  'border-right', 'border-right-color', 'border-right-style',
  'border-right-width',
  'border-style',
  'border-top', 'border-top-color', 'border-top-left-radius',
  'border-top-right-radius', 'border-top-style', 'border-top-width',
  'border-width',
  // slow: box-shadow
  'clear',
  'color',
  'display',
  'float',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'line-height',
  // URI-like: list-style, list-style-image
  'list-style-position',
  'list-style-type',
  'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top',
  'padding', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top',
  'text-align', 'text-align-last',
  'text-decoration', 'text-decoration-color', 'text-decoration-line',
  'text-decoration-style', 'text-indent',
  'vertical-align',
  'white-space',
  'width',
  'word-break', 'word-spacing', 'word-wrap',
];

/**
 * The regular expression to detect nodes that should be passed to stashLinks.
 *
 * ignore-case is not required; the value is checked against the lower-cased tag.
 */
var RE_NODE_NEEDS_TRANSFORM = /^(?:a|area|img)$/;

var RE_CID_URL = /^cid:/i;
var RE_HTTP_URL = /^http(?:s)?/i;
var RE_MAILTO_URL = /^mailto:/i;

var RE_IMG_TAG = /^img$/;

function getAttributeFromList(attrs, name) {
  for (var i = 0; i < attrs.length; i++) {
    var attr = attrs[i];
    if (attr.name.toLowerCase() === name) {
      return attr;
    }
  }
  return null;
}

/**
 * Transforms src tags, ensure that links are http and transform them too so
 * that they don't actually navigate when clicked on but we can hook them.  (The
 * HTML display iframe is not intended to navigate; we just want to trigger the
 * browser.
 */
function stashLinks(lowerTag, attrs) {
  var classAttr;
  // - img: src
  if (RE_IMG_TAG.test(lowerTag)) {
    // filter out things we might write to, also find the 'class attr'
    attrs = attrs.filter(function(attr) {
      switch (attr.name.toLowerCase()) {
        case 'cid-src':
        case 'ext-src':
          return false;
        case 'class':
          classAttr = attr;
        default:
          return true;
      }
    });

    var srcAttr = getAttributeFromList(attrs, 'src');
    if (srcAttr) {
      if (RE_CID_URL.test(srcAttr.escaped)) {
        srcAttr.name = 'cid-src';
        if (classAttr)
          classAttr.escaped += ' moz-embedded-image';
        else
          attrs.push({ name: 'class', escaped: 'moz-embedded-image' });
        // strip the cid: bit, it is necessarily there and therefore redundant.
        srcAttr.escaped = srcAttr.escaped.substring(4);
      }
      else if (RE_HTTP_URL.test(srcAttr.escaped)) {
        srcAttr.name = 'ext-src';
        if (classAttr)
          classAttr.escaped += ' moz-external-image';
        else
          attrs.push({ name: 'class', escaped: 'moz-external-image' });
      }
    }
  }
  // - a, area: href
  else {
    // filter out things we might write to, also find the 'class attr'
    attrs = attrs.filter(function(attr) {
      switch (attr.name.toLowerCase()) {
        case 'cid-src':
        case 'ext-src':
          return false;
        case 'class':
          classAttr = attr;
        default:
          return true;
      }
    });
    var linkAttr = getAttributeFromList(attrs, 'href'),
        link = linkAttr.escaped;
    if (RE_HTTP_URL.test(link) ||
        RE_MAILTO_URL.test(link)) {

      linkAttr.name = 'ext-href';
      if (classAttr)
        classAttr.escaped += ' moz-external-link';
      else
        attrs.push({ name: 'class', escaped: 'moz-external-link' });
    }
    else {
      // paranoia; no known benefit if this got through
      attrs.splice(attrs.indexOf(linkAttr), 1);
    }
  }
  return attrs;
}

var BLEACH_SETTINGS = {
  tags: LEGAL_TAGS,
  strip: true,
  stripComments: true,
  prune: PRUNE_TAGS,
  attributes: LEGAL_ATTR_MAP,
  styles: LEGAL_STYLES,
  asNode: true,
  callbackRegexp: RE_NODE_NEEDS_TRANSFORM,
  callback: stashLinks
};

/**
 * @args[
 *   @param[htmlString String]{
 *     An unsanitized HTML string.  The HTML content can be a fully valid HTML
 *     document with 'html' and 'body' tags and such, but most of that extra
 *     structure will currently be discarded.
 *
 *     In the future we may try and process the body and such correctly, but for
 *     now we don't.  This is consistent with many webmail clients who ignore
 *     style tags in the head, etc.
 *   }
 * ]
 * @return[HtmlString]{
 *   The sanitized HTML string wrapped into a div container.
 * }
 */
exports.sanitizeAndNormalizeHtml = function sanitizeAndNormalize(htmlString) {
  return $bleach.clean(htmlString, BLEACH_SETTINGS);
};

/**
 * Derive snippet text from the already-sanitized HTML representation.
 */
exports.generateSnippet = function generateSnippet(sanitizedHtml,
                                                   desiredLength) {
  return $bleach.generateSnippet(sanitizedHtml, desiredLength);
};

/**
 * Wrap text/plain content into a serialized HTML string safe for insertion
 * via innerHTML.
 *
 * By default we wrap everything in a 'div' tag with 'br' indicating newlines.
 * Alternately, we could use 'white-space: pre-wrap' if we were more confident
 * about recipients having sufficient CSS support and our own desire to have
 * things resemble text/plain.
 *
 */
exports.wrapTextIntoSafeHTMLString = function(text, wrapTag,
                                              transformNewlines, attrs) {
  if (transformNewlines === undefined)
    transformNewlines = true;

  wrapTag = wrapTag || 'div';

  text = transformNewlines ? text.replace(/\n/g, '<br/>') : text;

  var attributes = '';
  if (attrs) {
    for (var i = 0; i < attrs.length; i += 2) {
      attributes += ' ' + attrs[i] + '="' + attrs[i + 1] +'"';
    }
  }

  return '<' + wrapTag + attributes + '>' + text + '</' + wrapTag + '>';
};

var RE_QUOTE_CHAR = /"/g;

/**
 * Make an HTML attribute value safe.
 */
exports.escapeAttrValue = function(s) {
  return s.replace(RE_QUOTE_CHAR, '&quot;');
};

}); // end define
;
/**
 *
 **/

define('mailapi/imap/imapchew',
  [
    '../quotechew',
    '../htmlchew',
    'exports'
  ],
  function(
    $quotechew,
    $htmlchew,
    exports
  ) {


/**
 * Process the headers and bodystructure of a message to build preliminary state
 * and determine what body parts to fetch.  The list of body parts will be used
 * to issue another fetch request, and those results will be passed to
 * `chewBodyParts`.
 *
 * For now, our stop-gap heuristics for content bodies are:
 * - pick text/plain in multipart/alternative
 * - recurse into other multipart types looking for an alterntive that has
 *    text.
 * - do not recurse into message/rfc822
 * - ignore/fail-out messages that lack a text part, skipping to the next
 *    task.  (This should not happen once we support HTML, as there are cases
 *    where there are attachments without any body part.)
 * - Append text body parts together; there is no benefit in separating a
 *    mailing list footer from its content.
 *
 * For attachments, our heuristics are:
 * - only like them if they have filenames.  We will find this as "name" on
 *    the "content-type" or "filename" on the "content-disposition", quite
 *    possibly on both even.  For imap.js, "name" shows up in the "params"
 *    dict, and filename shows up in the "disposition" dict.
 * - ignore crypto signatures, even though they are named.  S/MIME gives us
 *    "smime.p7s" as an application/pkcs7-signature under a multipart/signed
 *    (that the server tells us is "signed").  PGP in MIME mode gives us
 *    application/pgp-signature "signature.asc" under a multipart/signed.
 *
 * The next step in the plan is to get an HTML sanitizer exposed so we can
 *  support text/html.  That will also imply grabbing multipart/related
 *  attachments.
 *
 * @typedef[ChewRep @dict[
 *   @key[bodyReps @listof[ImapJsPart]]
 *   @key[attachments @listof[AttachmentInfo]]
 *   @key[relatedParts @listof[RelatedPartInfo]]
 * ]]
 * @return[ChewRep]
 */
function chewStructure(msg) {
  // imap.js builds a bodystructure tree using lists.  All nodes get wrapped
  //  in a list so they are element zero.  Children (which get wrapped in
  //  their own list) follow.
  //
  // Examples:
  //   text/plain =>
  //     [{text/plain}]
  //   multipart/alternative with plaintext and HTML =>
  //     [{alternative} [{text/plain}] [{text/html}]]
  //   multipart/mixed text w/attachment =>
  //     [{mixed} [{text/plain}] [{application/pdf}]]
  var attachments = [], bodyReps = [], unnamedPartCounter = 0,
      relatedParts = [];

  /**
   * Sizes are the size of the encoded string, not the decoded value.
   */
  function estimatePartSizeInBytes(partInfo) {
    var encoding = partInfo.encoding.toLowerCase();
    // Base64 encodes 3 bytes in 4 characters with padding that always
    // causes the encoding to take 4 characters.  The max encoded line length
    // (ignoring CRLF) is 76 bytes, with 72 bytes also fairly common.
    // As such, a 78=19*4+2 character line encodes 57=19*3 payload bytes and
    // we can use that as a rough estimate.
    if (encoding === 'base64') {
      return Math.floor(partInfo.size * 57 / 78);
    }
    // Quoted printable is hard to predict since only certain things need
    // to be encoded.  It could be perfectly efficient if the source text
    // has a bunch of newlines built-in.
    else if (encoding === 'quoted-printable') {
      // Let's just provide an upper-bound of perfectly efficient.
      return partInfo.size;
    }
    // No clue; upper bound.
    return partInfo.size;
  }

  function chewLeaf(branch) {
    var partInfo = branch[0], i,
        filename, disposition;

    // - Detect named parts; they could be attachments
    if (partInfo.params && partInfo.params.name)
      filename = partInfo.params.name;
    else if (partInfo.disposition && partInfo.disposition.params &&
             partInfo.disposition.params.filename)
      filename = partInfo.disposition.params.filename;
    else
      filename = null;

    // - Start from explicit disposition, make attachment if non-displayable
    if (partInfo.disposition)
      disposition = partInfo.disposition.type.toLowerCase();
    // UNTUNED-HEURISTIC (need test cases)
    // Parts with content ID's explicitly want to be referenced by the message
    // and so are inline.  (Although we might do well to check if they actually
    // are referenced.  This heuristic could be very wrong.)
    else if (partInfo.id)
      disposition = 'inline';
    else if (filename || partInfo.type !== 'text')
      disposition = 'attachment';
    else
      disposition = 'inline';

    // Some clients want us to display things inline that we simply can't
    // display (historically and currently, PDF) or that our usage profile
    // does not want to automatically download (in the future, PDF, because
    // they can get big.)
    if (partInfo.type !== 'text' &&
        partInfo.type !== 'image')
      disposition = 'attachment';

    // - But we don't care if they are signatures...
    if ((partInfo.type === 'application') &&
        (partInfo.subtype === 'pgp-signature' ||
         partInfo.subtype === 'pkcs7-signature'))
      return true;

    function stripArrows(s) {
      if (s[0] === '<')
        return s.slice(1, -1);
      return s;
    }

    function makePart(partInfo, filename) {
      return {
        name: filename || 'unnamed-' + (++unnamedPartCounter),
        contentId: partInfo.id ? stripArrows(partInfo.id) : null,
        type: (partInfo.type + '/' + partInfo.subtype).toLowerCase(),
        part: partInfo.partID,
        encoding: partInfo.encoding && partInfo.encoding.toLowerCase(),
        sizeEstimate: estimatePartSizeInBytes(partInfo),
        file: null,
        /*
        charset: (partInfo.params && partInfo.params.charset &&
                  partInfo.params.charset.toLowerCase()) || undefined,
        textFormat: (partInfo.params && partInfo.params.format &&
                     partInfo.params.format.toLowerCase()) || undefined
         */
      };
    }

    function makeTextPart(partInfo) {
      return {
        type: partInfo.subtype,
        part: partInfo.partID,
        sizeEstimate: partInfo.size,
        amountDownloaded: 0,
        // its important to know that sizeEstimate and amountDownloaded
        // do _not_ determine if the bodyRep is fully downloaded the
        // estimated amount is not reliable
        isDownloaded: false,
        // full internal IMAP representation
        // it would also be entirely appropriate to move
        // the information on the bodyRep directly?
        _partInfo: partInfo
      };
    }

    if (disposition === 'attachment') {
      attachments.push(makePart(partInfo, filename));
      return true;
    }

    // - We must be an inline part or structure
    switch (partInfo.type) {
      // - related image
      case 'image':
        relatedParts.push(makePart(partInfo, filename));
        return true;
        break;
      // - content
      case 'text':
        if (partInfo.subtype === 'plain' ||
            partInfo.subtype === 'html') {
          bodyReps.push(makeTextPart(partInfo));
          return true;
        }
        break;
    }
    return false;
  }

  function chewMultipart(branch) {
    var partInfo = branch[0], i;

    // - We must be an inline part or structure
    // I have no idea why the multipart is the 'type' rather than the subtype?
    switch (partInfo.subtype) {
      // - for alternative, scan from the back to find the first part we like
      // XXX I believe in Thunderbird we observed some ridiculous misuse of
      // alternative that we'll probably want to handle.
      case 'alternative':
        for (i = branch.length - 1; i >= 1; i--) {
          var subPartInfo = branch[i][0];

          switch(subPartInfo.type) {
            case 'text':
              // fall out for subtype checking
              break;
            case 'multipart':
              // this is probably HTML with attachments, let's give it a try
              if (chewMultipart(branch[i]))
                return true;
              break;
            default:
              // no good, keep going
              continue;
          }

          switch (subPartInfo.subtype) {
            case 'html':
            case 'plain':
              // (returns true if successfully handled)
              if (chewLeaf(branch[i]))
                return true;
          }
        }
        // (If we are here, we failed to find a valid choice.)
        return false;
      // - multipart that we should recurse into
      case 'mixed':
      case 'signed':
      case 'related':
        for (i = 1; i < branch.length; i++) {
          if (branch[i].length > 1)
            chewMultipart(branch[i]);
          else
            chewLeaf(branch[i]);
        }
        return true;

      default:
        console.warn('Ignoring multipart type:', partInfo.subtype);
        return false;
    }
  }

  if (msg.structure.length > 1)
    chewMultipart(msg.structure);
  else
    chewLeaf(msg.structure);

  return {
    bodyReps: bodyReps,
    attachments: attachments,
    relatedParts: relatedParts,
  };
};

exports.chewHeaderAndBodyStructure =
  function(msg, folderId, newMsgId) {
  // begin by splitting up the raw imap message
  var parts = chewStructure(msg);
  var rep = {};

  rep.header = {
    // the FolderStorage issued id for this message (which differs from the
    // IMAP-server-issued UID so we can do speculative offline operations like
    // moves).
    id: newMsgId,
    srvid: msg.id,
    // The sufficiently unique id is a concatenation of the UID onto the
    // folder id.
    suid: folderId + '/' + newMsgId,
    // The message-id header value; as GUID as get for now; on gmail we can
    // use their unique value, or if we could convince dovecot to tell us, etc.
    guid: msg.msg.meta.messageId,
    // mailparser models from as an array; we do not.
    author: msg.msg.from[0] || null,
    to: ('to' in msg.msg) ? msg.msg.to : null,
    cc: ('cc' in msg.msg) ? msg.msg.cc : null,
    bcc: ('bcc' in msg.msg) ? msg.msg.bcc : null,

    replyTo: ('reply-to' in msg.msg.parsedHeaders) ?
               msg.msg.parsedHeaders['reply-to'] : null,

    date: msg.date,
    flags: msg.flags,
    hasAttachments: parts.attachments.length > 0,
    subject: msg.msg.subject || null,

    // we lazily fetch the snippet later on
    snippet: null
  };


  rep.bodyInfo = {
    date: msg.date,
    size: 0,
    attachments: parts.attachments,
    relatedParts: parts.relatedParts,
    references: msg.msg.meta.references,
    bodyReps: parts.bodyReps
  };

  return rep;
};

var DESIRED_SNIPPET_LENGTH = 100;

/**
 * Fill a given body rep with the content from fetching
 * part or the entire body of the message...
 *
 *    var body = ...;
 *    var header = ...;
 *    var content = (some fetched content)..
 *
 *    $imapchew.updateMessageWithBodyRep(
 *      header,
 *      bodyInfo,
 *      {
 *        bodyRepIndex: 0,
 *        text: '',
 *        buffer: Uint8Array|Null,
 *        bytesFetched: n,
 *        bytesRequested: n
 *      }
 *    );
 *
 *    // what just happend?
 *    // 1. the body.bodyReps[n].content is now the value of content.
 *    //
 *    // 2. we update .downloadedAmount with the second argument
 *    //    (number of bytes downloaded).
 *    //
 *    // 3. if snippet has not bee set on the header we create the snippet
 *    //    and set its value.
 *
 */
exports.updateMessageWithFetch =
  function(header, body, req, res) {

  var bodyRep = body.bodyReps[req.bodyRepIndex];

  // check if the request was unbounded or we got back less bytes then we
  // requested in which case the download of this bodyRep is complete.
  if (!req.bytes || res.bytesFetched < req.bytes[1]) {
    bodyRep.isDownloaded = true;

    // clear private space for maintaining parser state.
    delete bodyRep._partInfo;
  }

  if (!bodyRep.isDownloaded && res.buffer) {
    bodyRep._partInfo.pendingBuffer = res.buffer;
  }

  var parsedContent;
  var snippet;
  switch (bodyRep.type) {
    case 'plain':
      parsedContent = $quotechew.quoteProcessTextBody(res.text);
      if (req.createSnippet) {
        header.snippet = $quotechew.generateSnippet(
          parsedContent, DESIRED_SNIPPET_LENGTH
        );
      }
      break;
    case 'html':
      var htmlStr = $htmlchew.sanitizeAndNormalizeHtml(res.text);
      if (req.createSnippet) {
        header.snippet = $htmlchew.generateSnippet(
          htmlStr, DESIRED_SNIPPET_LENGTH
        );
      }
      parsedContent = htmlStr;
      break;
  }

  bodyRep.amountDownloaded += res.bytesFetched;

  // if the body rep is fully downloaded then we should set the content as text
  // otherwise the message is likely garbled and the snippet is the best we can
  // do.
  if (bodyRep.isDownloaded) {
    bodyRep.content = parsedContent;
  }
};

/**
 * Selects a desirable snippet body rep if the given header has no snippet.
 */
exports.selectSnippetBodyRep = function(header, body) {
  if (header.snippet)
    return -1;

  var bodyReps = body.bodyReps;
  var len = bodyReps.length;

  for (var i = 0; i < len; i++) {
    if (exports.canBodyRepFillSnippet(bodyReps[i])) {
      return i;
    }
  }

  return -1;
};

/**
 * Determines if a given body rep can be converted into a snippet. Useful for
 * determining which body rep to use when downloading partial bodies.
 *
 *
 *    var bodyInfo;
 *    $imapchew.canBodyRepFillSnippet(bodyInfo.bodyReps[0]) // true/false
 *
 */
exports.canBodyRepFillSnippet = function(bodyRep) {
  return (
    bodyRep &&
    bodyRep.type === 'plain' ||
    bodyRep.type === 'html'
  );
};

}); // end define
;