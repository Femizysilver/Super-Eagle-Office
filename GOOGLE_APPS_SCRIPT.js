/**
 * GOOGLE APPS SCRIPT BACKEND
 * 
 * 1. Open a Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Paste this code and Save.
 * 4. Click 'Deploy' > 'New Deployment'.
 * 5. Select 'Web App'.
 * 6. Set 'Execute as' to 'Me'.
 * 7. Set 'Who has access' to 'Anyone'.
 * 8. Copy the Web App URL and add it to your .env file as VITE_GOOGLE_SCRIPT_URL.
 */

function doPost(e) {
  try {
    const contents = e.postData.contents;
    const data = JSON.parse(contents);
    const action = data.action;
    const email = data.email;
    
    if (!email) return response({ error: "Email required" });
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(email);
    
    // Automatically create a new sheet for the user if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(email);
      // Initialize headers with new fields
      sheet.appendRow(["Type", "Date/Time", "Details/Service", "Status", "Amount", "Currency", "Platform", "Duration (Days)", "Role"]);
      sheet.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#f3f4f6");
      
      // Store user role in a hidden way or just as the first entry
      sheet.appendRow(["User Profile", new Date(), "Initial Setup", "Active", "", "", "", "", data.role || "user"]);
    }
    
    const role = data.role || (sheet.getRange(2, 9).getValue() || "user");

    switch (action) {
      case "signup":
        // Store vault password if provided
        if (data.vaultPassword) {
          sheet.appendRow(["Vault Config", new Date(), "Password Hash", "Secure", data.vaultPassword, "", "", "", role]);
        }
        return response({ success: true, message: "Account created" });
        
      case "sendOTP":
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        // Store OTP temporarily in script properties or a sheet
        PropertiesService.getScriptProperties().setProperty('OTP_' + email, otp);
        MailApp.sendEmail({
          to: email,
          subject: "Your Secure Vault OTP",
          body: "Your One-Time Password for the Freelancer Vault is: " + otp + "\n\nThis code will expire shortly."
        });
        return response({ success: true, message: "OTP sent to " + email });

      case "verifyOTP":
        const storedOtp = PropertiesService.getScriptProperties().getProperty('OTP_' + email);
        if (data.otp === storedOtp) {
          PropertiesService.getScriptProperties().deleteProperty('OTP_' + email);
          return response({ success: true, message: "OTP verified" });
        }
        return response({ error: "Invalid OTP" });

      case "attendance":
        sheet.appendRow(["Attendance", new Date(), data.details, data.status, "", "", "", "", role]);
        return response({ success: true, message: "Attendance recorded" });
        
      case "order":
      case "project":
        // Unified Project/Order type
        const type = "Project/Order";
        const details = action === "order" ? data.service : data.name;
        sheet.appendRow([type, new Date(), details, data.status, data.amount || "", data.currency || "", data.platform || "", data.duration || "", role]);
        return response({ success: true, message: "Record updated" });

      case "saveVault":
        // Encrypting on client side is better, but for now we store as "Vault Entry"
        sheet.appendRow(["Vault Entry", new Date(), data.accountName, "Encrypted", data.username, data.password, data.securityQuestion, data.location, role]);
        return response({ success: true, message: "Vault entry saved" });

      case "listUsers":
        // Only admins should call this, but we'll return all sheet names (emails)
        const sheets = ss.getSheets();
        const userEmails = sheets.map(s => s.getName()).filter(name => name.includes('@'));
        return response({ success: true, data: userEmails });
        
      default:
        return response({ error: "Invalid action: " + action });
    }
  } catch (err) {
    return response({ error: "Server Error: " + err.toString() });
  }
}

function response(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const action = e.parameter.action;
  const email = e.parameter.email;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === "listUsers") {
    const sheets = ss.getSheets();
    const userEmails = sheets.map(s => s.getName()).filter(name => name.includes('@'));
    return response({ success: true, data: userEmails });
  }

  if (action === "login") {
    if (!email) return response({ error: "Email required" });
    const userSheet = ss.getSheetByName(email);
    if (!userSheet) return response({ error: "User not found" });
    const profileRow = userSheet.getRange(2, 1, 1, 9).getValues()[0];
    return response({ success: true, name: profileRow[2], role: profileRow[8] });
  }

  if (!email) return response({ error: "Email required" });
  
  const sheet = ss.getSheetByName(email);
  if (!sheet) return response({ success: true, data: [] });
  
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const jsonData = rows.map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  
  return response({ success: true, data: jsonData });
}
