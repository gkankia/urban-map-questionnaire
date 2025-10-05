import fetch from "node-fetch"; // only needed if Node version <18

export async function handler(event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  try {
    const data = JSON.parse(event.body);

    // Replace with your Apps Script web app URL
    const GOOGLE_SCRIPT_URL =
      "https://script.google.com/macros/s/AKfycbwC_EOX_1SMHQo718n9JfDBOvP2ZvC9EmqJSOOMy39VpS162vqVVB7I7W00fWcmyDNR/exec";

    // Forward the POST request to Google Apps Script
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ status: "error", message: error.message }),
    };
  }
}