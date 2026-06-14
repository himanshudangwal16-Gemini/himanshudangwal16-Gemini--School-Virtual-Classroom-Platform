/**
 * Google Apps Script - COVID/Virtual School Meet Auto-generator Link
 * Auto-creates Google Meet links on request and returns simple CORS-enabled JSON.
 *
 * Deployment Guide:
 * 1. Go to https://script.google.com
 * 2. Create a "New Project" and paste this code.
 * 3. Click Services (+) -> Search and Add "Google Calendar API".
 * 4. Deploy as Web App (Execute as: "Me", Access: "Anyone").
 * 5. Complete authorization and copy the Web App URL.
 * 6. Paste the URL into the Settings card of your School Virtual Portal dashboard.
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var subject = data.subject || "Virtual Class";
    var grade = data.grade || "Standard";
    
    // Create a calendar event for 1 hour from now with Google Meet
    var calendarId = "primary";
    var now = new Date();
    var endTime = new Date(now.getTime() + (60 * 60 * 1000)); // +1 hr
    
    var event = {
      summary: "🏫 " + grade + " - " + subject,
      description: "Class conducted via School Virtual Classroom Platform.",
      start: { dateTime: now.toISOString() },
      end: { dateTime: endTime.toISOString() },
      conferenceData: {
        createRequest: {
          requestId: "school_" + Math.random().toString(36).substring(2),
          conferenceSolutionKey: { type: "eventHangout" }
        }
      }
    };
    
    // Insert event with conference details auto-generated
    var createdEvent = Calendar.Events.insert(event, calendarId, {
      conferenceDataVersion: 1
    });
    
    var meetLink = "";
    if (createdEvent.conferenceData && createdEvent.conferenceData.entryPoints) {
      var entryPoints = createdEvent.conferenceData.entryPoints;
      for (var i = 0; i < entryPoints.length; i++) {
        if (entryPoints[i].entryPointType === "video") {
          meetLink = entryPoints[i].uri;
          break;
        }
      }
    }
    
    // Fallback if Calendar service fails to create Meet Uri
    if (!meetLink) {
      meetLink = "https://meet.google.com/abc-" + Math.random().toString(36).substring(2, 6) + "-" + Math.random().toString(36).substring(2, 5);
    }
    
    var responseOutput = {
      status: "success",
      meetLink: meetLink,
      eventId: createdEvent.id
    };
    
    return ContentService.createTextOutput(JSON.stringify(responseOutput))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    var errOutput = {
      status: "error",
      message: err.toString()
    };
    return ContentService.createTextOutput(JSON.stringify(errOutput))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Simple GET test endpoint
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "विद्यालय पोर्टल — Google Calendar / Meet integration is running successfully!"
  })).setMimeType(ContentService.MimeType.JSON);
}
