// =========================================================================
// CARFECTIVE QUESTIONNAIRE - ADVANCED GOOGLE APPS SCRIPT
// Features: Drive Uploads, Client Folders, Sheet Logging, Telegram Alerts (w/ PDF), HTML Email Replies, Pricing
// =========================================================================

const FOLDER_ID = "12smm7OVEeZQbZK11SDvB7uSb1IkhJ7Q5"; // Replace with your Drive folder ID
const SHEET_NAME = "Sheet1";

// --- TELEGRAM SETTINGS ---
const TELEGRAM_BOT_TOKEN = "8764149652:AAEfZyCtfNPzRcnw8hdAKel1g6D8nFB9KP0";
const TELEGRAM_CHAT_ID = "-1003996812032";

// --- EMAIL SETTINGS ---
const EMAIL_SUBJECT = "Next Steps with Carfective";
const EMAIL_SENDER_NAME = "Carfective Consultant";

// --- LOGO SETTINGS ---
const LOGO_URL = "https://raw.githubusercontent.com/arjun-thomas/cf2/refs/heads/main/brand_assets/black%20(1).png";
const INCLUDE_LOGO_IN_PDF = false;
const INCLUDE_LOGO_IN_EMAIL = true;

// =========================================================================
// FAST PATH — returns success to the user immediately
// =========================================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const rootFolder = DriveApp.getFolderById(FOLDER_ID);

    // --- 0. Create Client-Specific Folder ---
    const clientName = data.contact_name || "Unknown Client";
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const folderName = `${clientName} - ${dateStr}`;
    const clientFolder = rootFolder.createFolder(folderName);

    // Store folder ID in data so the background job can find it
    data._clientFolderId = clientFolder.getId();

    // --- 1. Calculate Pricing ---
    let selectedPackage = data.selected_package || "None Selected";
    let additionalServicesRaw = data.additional_services || "";

    let packagePrice = 0;
    if (selectedPackage === "Silver") packagePrice = 750;
    if (selectedPackage === "Gold") packagePrice = 1250;
    if (selectedPackage === "Platinum") packagePrice = 2500;

    let additionalServicesArray = additionalServicesRaw ? additionalServicesRaw.split(", ") : [];
    let additionalServicesPrice = additionalServicesArray.length * 400;

    let adhocPrice = 0;
    let adhocAddonsList = [];
    if (data.option_consultation) { adhocPrice += 300; adhocAddonsList.push("Consultation ($300)"); }
    if (data.option_pricing === "Yes") { adhocPrice += 100; adhocAddonsList.push("Pricing/Quotes ($100)"); }
    if (data.option_history === "Yes") { adhocPrice += 10; adhocAddonsList.push("History Report ($10)"); }
    if (data.option_whatsapp === "Yes") { adhocPrice += 100; adhocAddonsList.push("WhatsApp Group ($100/yr)"); }

    data.calculatedTotal = "$" + (packagePrice + additionalServicesPrice + adhocPrice);
    data.packagePrice = "$" + packagePrice;
    data.additionalPrice = "$" + additionalServicesPrice;
    data.adhocAddonsText = adhocAddonsList.length > 0 ? adhocAddonsList.join("<br>") : "None";
    data.numAdditionalServices = additionalServicesArray.length;
    data.selected_package = selectedPackage;

    // --- 2. Handle File Uploads (into client folder) ---
    function processUploads(fileData, defaultName) {
      if (!fileData) return "No File";
      if (Object.keys(fileData).length === 0 && !Array.isArray(fileData)) return "No File";
      let urls = [];
      const processSingleFile = (fileObj) => {
        if (!fileObj || !fileObj.base64) return;
        const blob = Utilities.newBlob(Utilities.base64Decode(fileObj.base64), fileObj.type || 'application/octet-stream', fileObj.name || defaultName);
        urls.push(clientFolder.createFile(blob).getUrl());
      };
      Array.isArray(fileData) ? fileData.forEach(processSingleFile) : processSingleFile(fileData);
      return urls.length > 0 ? urls.join(",\n") : "No File";
    }

    let buildSheetUrl = processUploads(data.build_sheet_pdf, 'Build_Sheet.pdf');
    let quoteFileUrl  = processUploads(data.quote_file, 'Quote_File.pdf');
    let tradeUploadUrl = processUploads(data.trade_upload, 'Trade_Upload.jpg');

    // --- 3. Write to Google Sheet (fast — do this before returning) ---
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    sheet.appendRow([
      new Date(),
      data.contact_name || "",        data.contact_email || "",       data.contact_phone || "",
      data.make || "",                data.model || "",               data.trim || "",
      data.drivetrain || "",          data.engine_type || "",
      data.ext_color || "",           data.int_color || "",
      buildSheetUrl,
      data.out_of_state || "",        data.max_distance || "",
      data.quotes_received || "",     data.quote_details || "",
      quoteFileUrl,
      data.deposit_placed || "",      data.deposit_dealer_name || "",
      data.test_driven || "",         data.test_driven_dealer_name || "",
      data.purchase_timeline || "",
      data.rank_timeline || "",       data.rank_build || "",          data.rank_price || "",
      data.rank_other || "",          data.rank_other_text || "",
      data.finance_type || "",        data.purchase_target_price || "",
      data.down_payment || "",        data.financing_source || "",    data.zero_interest || "",
      data.target_monthly || "",      data.miles_per_year || "",      data.lease_term || "",
      data.open_to_msd || "",         data.credit_score || "",
      data.trade_in || "",            data.trade_details || "",
      tradeUploadUrl,
      data.purchase_entity || "",     data.has_cosigner || "",        data.cosigner_name || "",
      data.registration_address || "",
      data.selected_package || "",
      data.additional_services || "",
      data.option_consultation || "", data.option_pricing || "",      data.pricing_details || "",
      data.option_history || "",      data.history_vin_details || "",
      data.option_whatsapp === "Yes" ? "Yes" : "",
      data.calculatedTotal,
      data.referral_source || "",
      data.referral_name || ""
    ]);

    // --- 4. Stash data for background job (PDF + Telegram + Email) ---
    // Strip base64 file content — already uploaded to Drive, not needed downstream
    delete data.build_sheet_pdf;
    delete data.quote_file;
    delete data.trade_upload;

    const jobId = Utilities.getUuid();
    const serialized = JSON.stringify(data);
    console.log('Job data size (bytes): ' + serialized.length);

    if (serialized.length > 90000) {
      console.warn('Job payload near cache limit: ' + serialized.length + ' bytes');
    }
    CacheService.getScriptCache().put('job_' + jobId, serialized, 600);
    PropertiesService.getScriptProperties().setProperty('pendingJob_' + jobId, '1');

    // Fire background trigger only if one isn't already queued
    try {
      const alreadyQueued = ScriptApp.getProjectTriggers()
        .some(t => t.getHandlerFunction() === 'runBackgroundJob');
      if (!alreadyQueued) {
        ScriptApp.newTrigger('runBackgroundJob')
          .timeBased()
          .after(1)
          .create();
        console.log('Background trigger created for job: ' + jobId);
      } else {
        console.log('Background trigger already queued, job will be picked up: ' + jobId);
      }
    } catch(triggerErr) {
      console.error('Trigger creation failed: ' + triggerErr.toString());
    }

    // --- 5. Return success immediately ---
    return ContentService
      .createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// =========================================================================
// BACKGROUND JOB — PDF, Telegram, Email (runs after response is sent)
// =========================================================================

function runBackgroundJob() {
  // Clean up this trigger first so it doesn't pile up
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'runBackgroundJob') ScriptApp.deleteTrigger(t);
  });

  const props = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();

  const allProps = props.getProperties();
  const jobIds = Object.keys(allProps)
    .filter(k => k.startsWith('pendingJob_'))
    .map(k => k.replace('pendingJob_', ''));

  if (jobIds.length === 0) return;
  console.log('Processing ' + jobIds.length + ' pending job(s)');

  for (const jobId of jobIds) {
    const dataStr = cache.get('job_' + jobId);
    props.deleteProperty('pendingJob_' + jobId);
    cache.remove('job_' + jobId);

    if (!dataStr) {
      console.warn('Cache miss for job: ' + jobId);
      continue;
    }

    const data = JSON.parse(dataStr);

    // Generate PDF and save to Drive
    let pdfBlob = null;
    try {
      pdfBlob = createPdfSummary(data);
      if (pdfBlob && data._clientFolderId) {
        DriveApp.getFolderById(data._clientFolderId).createFile(pdfBlob);
      }
    } catch(e) {
      console.error('PDF generation error for job ' + jobId + ': ' + e.toString());
    }

    // Send Telegram with PDF
    try {
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && pdfBlob) {
        sendTelegramAlertWithPdf(data, pdfBlob);
      }
    } catch(e) {
      console.error('Telegram error for job ' + jobId + ': ' + e.toString());
    }

    // Send client email
    try {
      if (data.contact_email) sendClientEmail(data);
    } catch(e) {
      console.error('Email error for job ' + jobId + ': ' + e.toString());
    }
  }
}

// =========================================================================
// HELPER FUNCTIONS (unchanged)
// =========================================================================

function formatPhone(raw) {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return raw;
  return digits.slice(0,3) + '-' + digits.slice(3,6) + '-' + digits.slice(6);
}

function generateHtmlContent(data, showLogo) {
  let logoHtml = "";
  if (showLogo && LOGO_URL) {
    logoHtml = `
      <div style="text-align: center; margin-bottom: 25px;">
        <img src="${LOGO_URL}" alt="Carfective Logo" style="max-height: 80px;" />
      </div>
    `;
  }

  const formattedPhone = formatPhone(data.contact_phone);
  const phoneDisplay = formattedPhone
    ? `<a href="tel:${data.contact_phone}" style="color: #333; text-decoration: none;">${formattedPhone}</a>`
    : "";

  const additionalServicesArray = data.additional_services ? data.additional_services.split(", ") : [];
  const additionalServicesHtml = additionalServicesArray.length > 0
    ? additionalServicesArray.map(s => `${s} ($400)`).join("<br>")
    : "None";

  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #333; background: #fafafa; padding: 20px; border-radius: 8px;">
      ${logoHtml}
      <h2 style="color: #D4AF37; text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; margin-bottom: 30px;">Client Questionnaire Summary</h2>
      <table style="width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <tr><td colspan="2" style="background-color: #f2f2f2; padding: 12px; font-weight: bold; border: 1px solid #ddd; font-size: 16px;">Contact Information</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd; width: 40%"><b>Primary Name:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.contact_name || ""}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Email & Phone:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.contact_email || ""} | ${phoneDisplay}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Registration Address:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.registration_address || ""}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Purchase Entity / Cosigner:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.purchase_entity || ""} | ${data.cosigner_name || "None"}</td></tr>
        <tr><td colspan="2" style="background-color: #f2f2f2; padding: 12px; font-weight: bold; border: 1px solid #ddd; font-size: 16px;">Vehicle Preferences</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Make / Model / Trim:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.make || ""} ${data.model || ""} ${data.trim || ""}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Drivetrain / Engine:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.drivetrain || ""} | ${data.engine_type || ""}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Exterior Color:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.ext_color || ""}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Interior Color:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.int_color || ""}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Out of State Search:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.out_of_state || ""} (${data.max_distance || ""})</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Priority Ranking:</b></td><td style="padding: 10px; border: 1px solid #ddd;">1. Pricing (${data.rank_price || "-"}) 2. Build (${data.rank_build || "-"}) 3. Timeline (${data.rank_timeline || "-"}) 4. Other (${data.rank_other_text || "-"})</td></tr>
        <tr><td colspan="2" style="background-color: #f2f2f2; padding: 12px; font-weight: bold; border: 1px solid #ddd; font-size: 16px;">Purchase / Lease Details</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Timeline / Goal:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.purchase_timeline || ""} | ${data.finance_type || ""}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Credit Score:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.credit_score || ""}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Purchase Targets:</b></td><td style="padding: 10px; border: 1px solid #ddd;">Max Price: ${data.purchase_target_price || "N/A"} | Down Pmt: ${data.down_payment || "N/A"}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Lease Targets:</b></td><td style="padding: 10px; border: 1px solid #ddd;">Max Monthly: ${data.target_monthly || "N/A"} | Terms: ${data.lease_term || ""} @ ${data.miles_per_year || ""} miles | MSDs: ${data.open_to_msd || "No"}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Financing Specifics:</b></td><td style="padding: 10px; border: 1px solid #ddd;">Source: ${data.financing_source || "N/A"} | Require 0%: ${data.zero_interest || "N/A"}</td></tr>
        <tr><td colspan="2" style="background-color: #f2f2f2; padding: 12px; font-weight: bold; border: 1px solid #ddd; font-size: 16px;">Market Activity & Trade-In</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Has Trade-In:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.trade_in || ""} - ${data.trade_details || ""}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Quotes Received:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.quotes_received || ""} - ${data.quote_details || ""}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Deposit Placed:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.deposit_placed || ""} (${data.deposit_dealer_name || ""})</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Test Driven:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.test_driven || ""} (${data.test_driven_dealer_name || ""})</td></tr>
        <tr><td colspan="2" style="background-color: #f2f2f2; padding: 12px; font-weight: bold; border: 1px solid #ddd; font-size: 16px;">Selected Services & Pricing</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Package:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.selected_package || "None"} (${data.packagePrice})</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Additional Services:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${additionalServicesHtml}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>Other Services:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.adhocAddonsText}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd; background-color: #fcf8e3;"><b>Estimated Total:</b></td><td style="padding: 10px; border: 1px solid #ddd; background-color: #fcf8e3; font-size: 18px;"><b>${data.calculatedTotal}</b></td></tr>
        <tr><td colspan="2" style="background-color: #f2f2f2; padding: 12px; font-weight: bold; border: 1px solid #ddd; font-size: 16px;">Referral</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><b>How did you hear about us:</b></td><td style="padding: 10px; border: 1px solid #ddd;">${data.referral_source || ""}${data.referral_name ? " — " + data.referral_name : ""}</td></tr>
      </table>
      <p style="text-align: center; color: #777; margin-top: 30px; font-size: 14px;">This document was automatically generated via the Carfective Web Portal.</p>
    </div>
  `;
}

function createPdfSummary(data) {
  if (!data) return null;
  const html = generateHtmlContent(data, INCLUDE_LOGO_IN_PDF);
  const blob = Utilities.newBlob(html, MimeType.HTML, "Summary.html");
  const pdfBlob = blob.getAs(MimeType.PDF);
  pdfBlob.setName(`Carfective_Lead_${(data.contact_name || "New").replace(/\s+/g, '_')}.pdf`);
  return pdfBlob;
}

function sendTelegramAlertWithPdf(data, pdfBlob) {
  if (!data || !pdfBlob) return;
  const urlParams = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;
  const caption =
    `🚨 <b>NEW LEAD: ${data.contact_name || "Unknown"}</b> 🚨\n\n` +
    `📞 ${data.contact_phone || "N/A"}\n` +
    `✉️ ${data.contact_email || "N/A"}\n\n` +
    `🚗 <b>Vehicle:</b> ${data.make || ""} ${data.model || ""}\n` +
    `⏳ <b>Timeline:</b> ${data.purchase_timeline || "N/A"}\n` +
    `📦 <b>Package:</b> ${data.selected_package || "N/A"}\n` +
    `💰 <b>Total Est:</b> ${data.calculatedTotal}\n\n` +
    `<i>Full PDF summary attached below.</i>\nCheck Google Drive for uploaded files.`;

  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
  const payload = Utilities.newBlob(
    "--" + boundary + "\r\n" +
    "Content-Disposition: form-data; name=\"chat_id\"\r\n\r\n" +
    TELEGRAM_CHAT_ID + "\r\n" +
    "--" + boundary + "\r\n" +
    "Content-Disposition: form-data; name=\"caption\"\r\n\r\n" +
    caption + "\r\n" +
    "--" + boundary + "\r\n" +
    "Content-Disposition: form-data; name=\"parse_mode\"\r\n\r\n" +
    "HTML\r\n" +
    "--" + boundary + "\r\n" +
    "Content-Disposition: form-data; name=\"document\"; filename=\"" + pdfBlob.getName() + "\"\r\n" +
    "Content-Type: application/pdf\r\n\r\n"
  ).getBytes()
  .concat(pdfBlob.getBytes())
  .concat(Utilities.newBlob("\r\n--" + boundary + "--\r\n").getBytes());

  const response = UrlFetchApp.fetch(urlParams, {
    method: "post",
    contentType: "multipart/form-data; boundary=" + boundary,
    payload: payload,
    muteHttpExceptions: true
  });
  console.log('Telegram response: ' + response.getContentText());
}

function sendClientEmail(data) {
  if (!data) return;
  const clientFirstName = data.contact_name ? data.contact_name.split(' ')[0] : "Client";
  const htmlBody = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #333; padding: 20px;">
      <p style="font-size: 15px; line-height: 1.5;">Hello ${clientFirstName},</p>
      <p style="font-size: 15px; line-height: 1.5;">Thank you for submitting the Client Vehicle Questionnaire. We have successfully received your information and our team is currently reviewing your responses.</p>
      <p style="font-size: 15px; line-height: 1.5;">If you selected to include quotes or a trade-in evaluation, please allow us a time to review and get back to you.</p>
      <br>
      ${generateHtmlContent(data, INCLUDE_LOGO_IN_EMAIL)}
      <br>
      <p style="font-size: 15px; line-height: 1.5; color: #D4AF37; font-weight: bold; margin-bottom: 5px;">Next Steps:</p>
      <ol style="font-size: 15px; line-height: 1.5; margin-top: 0; padding-left: 18px;">
        <li>If you would like to proceed, we can have a 15 minute consultation.</li>
        <li>To get started, a 50% deposit of the Estimated Total is required.</li>
        <li>Make Zelle payments to <b>carfective@gmail.com</b>.</li>
      </ol>
      <p style="font-size: 15px; line-height: 1.5;">Please reply to this email and we'll proceed accordingly.</p>
      <p style="font-size: 15px; line-height: 1.5;">We look forward to hearing from you!</p>
      <br>
      <p style="font-size: 15px; line-height: 1.5; margin-bottom: 0;">Sincerely,</p>
      <p style="font-size: 15px; line-height: 1.5; margin-top: 5px;"><strong>The Carfective Team</strong></p>
    </div>
  `;
  MailApp.sendEmail({
    to: data.contact_email,
    cc: Session.getEffectiveUser().getEmail(),
    subject: `${clientFirstName} - ${EMAIL_SUBJECT}`,
    htmlBody: htmlBody,
    name: EMAIL_SENDER_NAME
  });
}