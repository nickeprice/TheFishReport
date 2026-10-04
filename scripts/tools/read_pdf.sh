#!/bin/bash
cat > /tmp/pdf.jxa <<'JXA'
ObjC.import('Quartz'); ObjC.import('Foundation');
function run(argv){ var d=$.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]));
  return ObjC.unwrap(d.string)||''; }
JXA
osascript -l JavaScript /tmp/pdf.jxa "$1"