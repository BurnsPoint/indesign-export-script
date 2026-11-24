/*
  InDesign ExtendScript
  Exports active document pages into:
  - PDF Print (PRINT preset)      -> format NOBLEED
  - PDF Print (PRINT_BLEED preset)-> format BLEED
  - PDF Interactive               -> format WEB
  - PNG 150 dpi                   -> format PNG@150
  - PNG 300 dpi                   -> format PNG@300

  File naming:
  {Document Name}-{Format}_{Page number}.{extension}
*/

(function () {
  if (app.documents.length === 0) {
    alert("No open document found. Open a document and run the script again.");
    return;
  }

  var doc = app.activeDocument;
  var baseFolder = doc.saved ? doc.filePath : Folder.desktop;
  var docName = doc.name.replace(/\.[^.]+$/i, "");
  var safeDocName = toSafeName(docName);
  var pageCount = doc.pages.length;
  var settings = readOptionalSettingsCsv(baseFolder, docName, safeDocName);
  var exportPlan = buildExportPlan(doc, settings.pageRows);
  var partialExport = hasPrefixSkippedPages(settings.pageRows, pageCount);
  var partialArchiveRoot = null;
  var partialArchiveChecked = {};

  var exportsBase = ensureFolder(baseFolder, "_exports");
  var exportRoot = new Folder(exportsBase.fsName + "/" + safeDocName);
  var formatList = getEnabledFormatLabels(settings.enabledFormats);
  if (formatList.length === 0) {
    alert("No valid export formats are enabled in the export settings CSV.");
    return;
  }

  if (!confirmStart(exportRoot, exportPlan, formatList, pageCount, settings.settingsFileName)) {
    return;
  }

  if (!partialExport) {
    archiveExistingExportFolderIfNeeded(exportsBase, exportRoot, safeDocName);
  }
  exportRoot = ensureFolder(exportsBase, safeDocName);
  var folderNoBleed = settings.enabledFormats.NOBLEED ? ensureFolder(exportRoot, "NOBLEED") : null;
  var folderBleed = settings.enabledFormats.BLEED ? ensureFolder(exportRoot, "BLEED") : null;
  var folderWeb = settings.enabledFormats.WEB ? ensureFolder(exportRoot, "WEB") : null;
  var folderPng = (settings.enabledFormats.PNG150 || settings.enabledFormats.PNG300)
    ? ensureFolder(exportRoot, "PNG")
    : null;

  var printPreset = getPdfPreset("PRINT");
  var bleedPreset = getPdfPreset("PRINT_BLEED");
  if (!printPreset || !bleedPreset) {
    return;
  }

  var originalPdfRange = app.pdfExportPreferences.pageRange;
  var originalPdfView = app.pdfExportPreferences.viewPDF;
  var originalInteractiveRange = app.interactivePDFExportPreferences.pageRange;
  var originalInteractiveView = app.interactivePDFExportPreferences.viewPDF;
  var originalPngRange = app.pngExportPreferences.pngExportRange;
  var originalPngPageString = app.pngExportPreferences.pageString;
  var originalPngQuality = app.pngExportPreferences.pngQuality;
  var originalPngResolution = app.pngExportPreferences.exportResolution;
  var originalPngTransparent = app.pngExportPreferences.transparentBackground;
  var originalPngSpread = app.pngExportPreferences.exportingSpread;
  var originalInteractiveSinglePages = null;
  var hasInteractiveSinglePages = false;
  try {
    originalInteractiveSinglePages = app.interactivePDFExportPreferences.exportAsSinglePages;
    hasInteractiveSinglePages = true;
  } catch (e) {}

  try {
    app.pdfExportPreferences.viewPDF = false;
    app.interactivePDFExportPreferences.viewPDF = false;
    if (hasInteractiveSinglePages) {
      app.interactivePDFExportPreferences.exportAsSinglePages = false;
    }

    var exportedPages = 0;
    for (var i = 0; i < exportPlan.length; i++) {
      var pageLabel = exportPlan[i].pageLabel;
      var safePageLabel = exportPlan[i].safeSuffix;

      if (settings.enabledFormats.NOBLEED) {
        exportPdfPrint(doc, printPreset, folderNoBleed, safeDocName, "NOBLEED", pageLabel, safePageLabel);
      }
      if (settings.enabledFormats.BLEED) {
        exportPdfPrint(doc, bleedPreset, folderBleed, safeDocName, "BLEED", pageLabel, safePageLabel);
      }
      if (settings.enabledFormats.WEB) {
        exportPdfInteractive(doc, folderWeb, safeDocName, "WEB", pageLabel, safePageLabel);
      }
      if (settings.enabledFormats.PNG150) {
        exportPng(doc, folderPng, safeDocName, "PNG@150", pageLabel, safePageLabel, 150);
      }
      if (settings.enabledFormats.PNG300) {
        exportPng(doc, folderPng, safeDocName, "PNG@300", pageLabel, safePageLabel, 300);
      }
      exportedPages++;
    }

    showCompletionDialog(exportRoot, exportedPages, pageCount, formatList.length);
  } catch (err) {
    alert("Export failed:\n" + err);
  } finally {
    app.pdfExportPreferences.pageRange = originalPdfRange;
    app.pdfExportPreferences.viewPDF = originalPdfView;
    app.interactivePDFExportPreferences.pageRange = originalInteractiveRange;
    app.interactivePDFExportPreferences.viewPDF = originalInteractiveView;
    if (hasInteractiveSinglePages) {
      app.interactivePDFExportPreferences.exportAsSinglePages = originalInteractiveSinglePages;
    }
    app.pngExportPreferences.pngExportRange = originalPngRange;
    app.pngExportPreferences.pageString = originalPngPageString;
    app.pngExportPreferences.pngQuality = originalPngQuality;
    app.pngExportPreferences.exportResolution = originalPngResolution;
    app.pngExportPreferences.transparentBackground = originalPngTransparent;
    app.pngExportPreferences.exportingSpread = originalPngSpread;
  }

  function exportPdfPrint(docRef, preset, outFolder, safeBaseName, formatName, pageRange, safePageNum) {
    app.pdfExportPreferences.pageRange = pageRange;
    var outFile = new File(outFolder.fsName + "/" + safeBaseName + "-" + formatName + "-" + safePageNum + ".pdf");
    archiveOverwrittenFile(outFile, outFolder.name);
    docRef.exportFile(ExportFormat.PDF_TYPE, outFile, false, preset);
  }

  function exportPdfInteractive(docRef, outFolder, safeBaseName, formatName, pageRange, safePageNum) {
    app.interactivePDFExportPreferences.pageRange = pageRange;
    var outFile = new File(outFolder.fsName + "/" + safeBaseName + "-" + formatName + "-" + safePageNum + ".pdf");
    archiveOverwrittenFile(outFile, outFolder.name);
    docRef.exportFile(ExportFormat.INTERACTIVE_PDF, outFile, false);
  }

  function exportPng(docRef, outFolder, safeBaseName, formatName, pageRange, safePageNum, resolution) {
    app.pngExportPreferences.pngExportRange = PNGExportRangeEnum.EXPORT_RANGE;
    app.pngExportPreferences.pageString = pageRange;
    app.pngExportPreferences.pngQuality = PNGQualityEnum.HIGH;
    app.pngExportPreferences.exportResolution = resolution;
    app.pngExportPreferences.transparentBackground = false;
    app.pngExportPreferences.exportingSpread = false;

    var tempBaseName = "__tmp_png_" + formatName.replace(/[^A-Za-z0-9]/g, "") + "_" + buildDateTimeStamp() + "_" + safePageNum;
    var tempOutFile = new File(outFolder.fsName + "/" + tempBaseName + ".png");
    var targetFile = new File(outFolder.fsName + "/" + safeBaseName + "-" + formatName + "-" + safePageNum + ".png");
    var expectedGeneratedFile = new File(outFolder.fsName + "/" + tempBaseName + "_" + pageRange + ".png");
    var generatedFile = null;

    docRef.exportFile(ExportFormat.PNG_FORMAT, tempOutFile, false);

    if (expectedGeneratedFile.exists) {
      generatedFile = expectedGeneratedFile;
    } else {
      generatedFile = findGeneratedPng(outFolder, tempBaseName);
    }

    if (!generatedFile || !generatedFile.exists) {
      throw new Error("PNG export did not create the expected file for page " + pageRange + ".");
    }

    archiveOverwrittenFile(targetFile, outFolder.name);
    if (targetFile.exists && !targetFile.remove()) {
      throw new Error("Could not overwrite existing PNG file:\n" + targetFile.fsName);
    }

    if (!generatedFile.rename(targetFile.name)) {
      throw new Error("Could not rename PNG export to:\n" + targetFile.fsName);
    }
  }

  function ensureFolder(parentFolder, folderName) {
    var folder = new Folder(parentFolder.fsName + "/" + folderName);
    if (!folder.exists) {
      folder.create();
    }
    return folder;
  }

  function hasPrefixSkippedPages(rows, totalPages) {
    if (!rows) return false;
    for (var i = 0; i < rows.length && i < totalPages; i++) {
      var prefix = rows[i].suffixValue.charAt(0);
      if (prefix === "#" || prefix === "/") return true;
    }
    return false;
  }

  function archiveOverwrittenFile(file, formatFolderName) {
    if (!partialExport) return;
    var key = "$" + file.fsName;
    if (partialArchiveChecked[key]) return;
    partialArchiveChecked[key] = true;
    if (!file.exists) return;
    if (!partialArchiveRoot) {
      var ssFolder = ensureFolder(exportsBase, "_ss");
      var baseName = "moved_" + buildDateTimeStamp();
      var name = baseName;
      var n = 1;
      while (new Folder(ssFolder.fsName + "/" + name).exists) {
        name = baseName + "_" + n++;
      }
      var movedFolder = ensureFolder(ssFolder, name);
      partialArchiveRoot = ensureFolder(movedFolder, safeDocName);
    }
    var archiveFolder = ensureFolder(partialArchiveRoot, formatFolderName);
    var archiveFile = new File(archiveFolder.fsName + "/" + file.name);
    if (archiveFile.exists || !file.copy(archiveFile.fsName)) {
      throw new Error("Could not archive existing export file:\n" + file.fsName);
    }
  }

  function findGeneratedPng(folder, tempBaseName) {
    var files = folder.getFiles(tempBaseName + "*.png");
    if (!files || files.length === 0) {
      return null;
    }
    for (var i = 0; i < files.length; i++) {
      if (files[i] instanceof File) {
        return files[i];
      }
    }
    return null;
  }

  function archiveExistingExportFolderIfNeeded(exportsFolder, currentExportFolder, safeName) {
    if (!currentExportFolder.exists) {
      return;
    }

    var stamp = buildDateTimeStamp();
    var ssFolder = ensureFolder(exportsFolder, "_ss");
    var movedFolder = ensureFolder(ssFolder, "moved_" + stamp);
    var archivedFolderName = safeName;
    var archivedFolder = new Folder(movedFolder.fsName + "/" + archivedFolderName);

    if (archivedFolder.exists) {
      archivedFolderName += "_" + getTimeSuffix();
      archivedFolder = new Folder(movedFolder.fsName + "/" + archivedFolderName);
    }

    if (!copyFolderContents(currentExportFolder, archivedFolder)) {
      throw new Error(
        "Could not move existing export folder to:\n" + archivedFolder.fsName
      );
    }

    if (!clearFolderContents(currentExportFolder)) {
      throw new Error(
        "Copied existing export folder to archive, but could not clear original folder:\n" + currentExportFolder.fsName
      );
    }

    // Box may keep hidden metadata (for example .DS_Store) in the folder.
    // Removing the container is optional because ensureFolder reuses it below.
    currentExportFolder.remove();
  }

  function buildDateTimeStamp() {
    var d = new Date();
    return (
      d.getFullYear() +
      pad2(d.getMonth() + 1) +
      pad2(d.getDate()) + "_" +
      pad2(d.getHours()) +
      pad2(d.getMinutes()) +
      pad2(d.getSeconds())
    );
  }

  function getTimeSuffix() {
    var d = new Date();
    return (
      pad2(d.getHours()) +
      pad2(d.getMinutes()) +
      pad2(d.getSeconds())
    );
  }

  function pad2(n) {
    var s = String(n);
    return s.length < 2 ? "0" + s : s;
  }

  function copyFolderContents(sourceFolder, targetFolder) {
    if (!targetFolder.exists && !targetFolder.create()) {
      return false;
    }

    var items = sourceFolder.getFiles();
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item instanceof Folder) {
        var childTarget = new Folder(targetFolder.fsName + "/" + item.name);
        if (!copyFolderContents(item, childTarget)) {
          return false;
        }
      } else {
        var childFile = new File(targetFolder.fsName + "/" + item.name);
        if (childFile.exists && !childFile.remove()) {
          return false;
        }
        if (!item.copy(childFile.fsName)) {
          return false;
        }
      }
    }
    return true;
  }

  function clearFolderContents(folder) {
    var items = folder.getFiles();
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item instanceof Folder) {
        if (!clearFolderContents(item)) {
          return false;
        }
        item.remove();
      } else if (!item.remove()) {
        return false;
      }
    }
    return true;
  }

  function getPdfPreset(presetName) {
    try {
      var preset = app.pdfExportPresets.itemByName(presetName);
      var _name = preset.name;
      return preset;
    } catch (e) {
      alert("PDF export preset '" + presetName + "' was not found.");
      return null;
    }
  }

  function toSafeName(name) {
    var s = String(name);
    var invalid = "\\/:*?\"<>|";
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      out += invalid.indexOf(ch) !== -1 ? "-" : ch;
    }
    return out;
  }

  function readOptionalSettingsCsv(rootFolder, documentName, safeDocumentName) {
    var csv = findSettingsCsv(rootFolder, documentName, safeDocumentName);
    if (!csv.exists) {
      return {
        pageRows: null,
        enabledFormats: getDefaultEnabledFormats(),
        settingsFileName: "(none)"
      };
    }

    if (!csv.open("r")) {
      alert("Could not open " + csv.name + ". Proceeding with default export behavior.");
      return {
        pageRows: null,
        enabledFormats: getDefaultEnabledFormats(),
        settingsFileName: "(none)"
      };
    }

    var content = csv.read();
    csv.close();

    var lines = content.split(/\r\n|\n|\r/);
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      rows.push(parseSettingsRow(lines[i]));
    }
    var settings = extractGlobalFormatSettings(rows);
    settings.settingsFileName = csv.name;
    return settings;
  }

  function findSettingsCsv(rootFolder, documentName, safeDocumentName) {
    var candidates = [
      documentName + "_indd_export_settings.csv",
      "indd_export_settings_" + documentName + ".csv",
      documentName + ".csv"
    ];

    if (safeDocumentName !== documentName) {
      candidates.push(safeDocumentName + "_indd_export_settings.csv");
      candidates.push("indd_export_settings_" + safeDocumentName + ".csv");
      candidates.push(safeDocumentName + ".csv");
    }

    candidates.push("indd_export_settings.csv");

    for (var i = 0; i < candidates.length; i++) {
      var csv = new File(rootFolder.fsName + "/" + candidates[i]);
      if (csv.exists) {
        return csv;
      }
    }

    return new File(rootFolder.fsName + "/indd_export_settings.csv");
  }

  function parseSettingsRow(line) {
    var fields = parseCsvFields(line, 2);
    return {
      rawFields: fields,
      suffixValue: fields[0],
      appendDimensions: fields[1].toLowerCase() === "p"
    };
  }

  function extractGlobalFormatSettings(rows) {
    var result = {
      pageRows: rows,
      enabledFormats: getDefaultEnabledFormats(),
      settingsFileName: "(none)"
    };
    var lastIndex = findLastNonEmptyRowIndex(rows);
    if (lastIndex === -1) {
      return result;
    }

    var lastRow = rows[lastIndex];
    if (lastRow.rawFields[0].toUpperCase() !== "FORMATS") {
      return result;
    }

    result.enabledFormats = parseGlobalFormats(lastRow.rawFields[1]);
    result.pageRows = rows.slice(0, lastIndex);
    return result;
  }

  function findLastNonEmptyRowIndex(rows) {
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i].rawFields[0] !== "" || rows[i].rawFields[1] !== "") {
        return i;
      }
    }
    return -1;
  }

  function getDefaultEnabledFormats() {
    return {
      NOBLEED: true,
      BLEED: true,
      WEB: true,
      PNG150: true,
      PNG300: true
    };
  }

  function parseGlobalFormats(value) {
    var enabled = {
      NOBLEED: false,
      BLEED: false,
      WEB: false,
      PNG150: false,
      PNG300: false
    };
    var text = trimString(value);
    if (text === "") {
      return getDefaultEnabledFormats();
    }

    var parts = text.split("|");
    for (var i = 0; i < parts.length; i++) {
      var token = trimString(parts[i]).toUpperCase();
      if (token === "NOBLEED") {
        enabled.NOBLEED = true;
      } else if (token === "BLEED") {
        enabled.BLEED = true;
      } else if (token === "WEB") {
        enabled.WEB = true;
      } else if (token === "PNG150") {
        enabled.PNG150 = true;
      } else if (token === "PNG300") {
        enabled.PNG300 = true;
      }
    }
    return enabled;
  }

  function getEnabledFormatLabels(enabledFormats) {
    var labels = [];
    if (enabledFormats.NOBLEED) {
      labels.push("NOBLEED");
    }
    if (enabledFormats.BLEED) {
      labels.push("BLEED");
    }
    if (enabledFormats.WEB) {
      labels.push("WEB");
    }
    if (enabledFormats.PNG150) {
      labels.push("PNG@150");
    }
    if (enabledFormats.PNG300) {
      labels.push("PNG@300");
    }
    return labels;
  }

  function parseCsvFields(line, limit) {
    var s = String(line);
    var fields = [];
    var field = "";
    var inQuotes = false;
    var i;

    if (s.length === 0) {
      for (i = 0; i < limit; i++) {
        fields.push("");
      }
      return fields;
    }

    for (i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (inQuotes) {
        if (ch === "\"") {
          if (i + 1 < s.length && s.charAt(i + 1) === "\"") {
            field += "\"";
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === "\"") {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(trimString(field));
        field = "";
        if (fields.length >= limit) {
          break;
        }
      } else {
        field += ch;
      }
    }

    if (fields.length < limit) {
      fields.push(trimString(field));
    }

    while (fields.length < limit) {
      fields.push("");
    }

    return fields;
  }

  function getPageExportInfo(rows, pageIndex, pageRef) {
    var defaultLabel = pageRef.name;
    var suffixValue = defaultLabel;
    var appendDimensions = false;

    if (!rows || pageIndex >= rows.length) {
      return {
        pageLabel: defaultLabel,
        suffix: defaultLabel
      };
    }

    var row = rows[pageIndex];
    if (row.suffixValue === "0" || row.suffixValue.charAt(0) === "/" || row.suffixValue.charAt(0) === "#") {
      return null;
    }
    if (row.suffixValue !== "") {
      suffixValue = row.suffixValue;
    }
    appendDimensions = row.appendDimensions;

    if (appendDimensions) {
      suffixValue += "-" + getPageDimensionsMm(pageRef);
    }

    return {
      pageLabel: defaultLabel,
      suffix: suffixValue
    };
  }

  function trimString(s) {
    return String(s).replace(/^\s+|\s+$/g, "");
  }

  function buildExportPlan(docRef, rows) {
    var plan = [];
    for (var i = 0; i < docRef.pages.length; i++) {
      var page = docRef.pages[i];
      var info = getPageExportInfo(rows, i, page);
      if (info === null) {
        continue;
      }
      plan.push({
        pageLabel: info.pageLabel,
        suffix: info.suffix,
        safeSuffix: toSafeName(info.suffix)
      });
    }
    return plan;
  }

  function getPageDimensionsMm(pageRef) {
    var bounds = pageRef.bounds;
    var viewPrefs = pageRef.parent.parent.viewPreferences;
    var widthMm = measurementToRoundedMm(bounds[3] - bounds[1], viewPrefs.horizontalMeasurementUnits);
    var heightMm = measurementToRoundedMm(bounds[2] - bounds[0], viewPrefs.verticalMeasurementUnits);
    return widthMm + "x" + heightMm;
  }

  function measurementToRoundedMm(value, unit) {
    if (unit === MeasurementUnits.MILLIMETERS) {
      return Math.round(value);
    }
    if (unit === MeasurementUnits.CENTIMETERS) {
      return Math.round(value * 10);
    }
    if (unit === MeasurementUnits.POINTS) {
      return Math.round((value * 25.4) / 72);
    }
    if (unit === MeasurementUnits.PICAS) {
      return Math.round((value * 12 * 25.4) / 72);
    }
    if (unit === MeasurementUnits.INCHES || unit === MeasurementUnits.INCHES_DECIMAL) {
      return Math.round(value * 25.4);
    }
    if (typeof MeasurementUnits.CICEROS !== "undefined" && unit === MeasurementUnits.CICEROS) {
      return Math.round((value * 12.789) / 1);
    }
    if (typeof MeasurementUnits.AGATES !== "undefined" && unit === MeasurementUnits.AGATES) {
      return Math.round((value * 1.9558) / 1);
    }
    if (typeof MeasurementUnits.Q !== "undefined" && unit === MeasurementUnits.Q) {
      return Math.round(value * 0.25);
    }
    return Math.round(value);
  }

  function confirmStart(outFolder, plan, formats, totalPages, settingsFileName) {
    var win = new Window("dialog", "Confirm Export");
    win.orientation = "column";
    win.alignChildren = "fill";

    var intro = "Export Location:\n" + outFolder.fsName + "\n\n";
    intro += "Settings CSV: " + settingsFileName + "\n";
    intro += "Pages to export: " + plan.length + " of " + totalPages + "\n";
    intro += "Page suffixes: " + buildPagePreview(plan) + "\n\n";
    intro += "Formats:\n- " + formats.join("\n- ");
    win.add("statictext", undefined, intro, { multiline: true });

    var btns = win.add("group");
    btns.alignment = "right";
    var continueBtn = btns.add("button", undefined, "Continue", { name: "ok" });
    btns.add("button", undefined, "Cancel", { name: "cancel" });
    continueBtn.active = true;

    return win.show() === 1;
  }

  function showCompletionDialog(outFolder, exportedPages, totalPages, formatCount) {
    var win = new Window("dialog", "Export Complete");
    win.orientation = "column";
    win.alignChildren = "fill";

    var msg = "Pages exported: " + exportedPages + " of " + totalPages + "\n";
    msg += "Formats per page: " + formatCount + "\n\n";
    msg += "Output folder:\n" + outFolder.fsName;
    win.add("statictext", undefined, msg, { multiline: true });

    var btns = win.add("group");
    btns.alignment = "right";
    var openBtn = btns.add("button", undefined, "Open Export Folder");
    btns.add("button", undefined, "Close", { name: "ok" });

    openBtn.onClick = function () {
      outFolder.execute();
    };

    win.show();
  }

  function buildPagePreview(plan) {
    if (plan.length === 0) {
      return "(none)";
    }
    var maxItems = 20;
    var parts = [];
    var count = Math.min(plan.length, maxItems);
    for (var i = 0; i < count; i++) {
      parts.push(plan[i].suffix);
    }
    if (plan.length > maxItems) {
      parts.push("... +" + (plan.length - maxItems) + " more");
    }
    return parts.join(", ");
  }
})();
