import fetch from 'node-fetch';

export async function handler(event, context) {
  const url = "https://script.google.com/macros/s/AKfycbwRShukywhUdgLnCoptNE5JCVOwthMVmj42_QpAtnDGyjzhTZIFsh9iBKADW6qWelWY/exec";
  const response = await fetch(url);
  const data = await response.json();
  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(data)
  };
}