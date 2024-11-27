import { NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";
import axios from "axios";

const slackToken = process.env.NEXT_SLACK_CHANNEL_ACCESS_TOKEN!;
const openaiApiKey = process.env.NEXT_PUBLIC_OPENAI_KEY!;

const slackClient = new WebClient(slackToken);
const processedEvents: Record<string, number> = {};

// Function to get OpenAI response
const getOpenAIResponse = async (userMessage: string): Promise<string> => {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [{ role: "user", content: userMessage }],
      },
      {
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.choices[0].message.content;
  };
  
  // Slack Events Endpoint
  export async function POST(req: Request) {
    const eventData = await req.json();
    console.log("Payload : ", eventData);
  
    // URL verification challenge (for Slack app installation)
    if (eventData.type === "url_verification") {
      const challenge = eventData.challenge;
      return NextResponse.json({ challenge });
    }
  
    // Handle other events (e.g., messages)
    if (eventData.event) {
      const event = eventData.event;
  
      // Ignore bot messages
      if (event.bot_id) {
        return NextResponse.json({ status: "ignored" });
      }
  
      // Prevent duplicate processing of events
      const eventId = eventData.event_id;
      const currentTime = Date.now();
      if (processedEvents[eventId]) {
        console.log(`Ignoring duplicate event: ${eventId}`);
        return NextResponse.json({ status: "duplicate" });
      }
  
      processedEvents[eventId] = currentTime;
  
      // Clean up old events
      for (const oldEventId in processedEvents) {
        if (currentTime - processedEvents[oldEventId] > 60 * 1000) {
          delete processedEvents[oldEventId];
        }
      }
  
      // Handle direct messages
      if (event.type === "message" && event.channel_type === "im") {
        const userMessage = event.text;
        const userId = event.user;
        const channel = event.channel;
  
        console.log(`Received DM from user ${userId}: ${userMessage}`);
  
        // Get OpenAI response
        try {
          const responseText = await getOpenAIResponse(userMessage);
  
          // Send the OpenAI response back to Slack
          await slackClient.chat.postMessage({
            channel,
            text: responseText,
          });
  
          return NextResponse.json({ status: "ok" });
        } catch (error) {
          console.error("Error processing the message:", error);
          return NextResponse.json({
            status: "error",
            message: "Failed to process the message",
          });
        }
      }
  
      // Handle mentions in channels
      if (event.type === "message" && event.channel_type === "channel") {
        const userMessage = event.text;
        const userId = event.user;
        const channel = event.channel;
  
        // Check if the bot is mentioned
        if (userMessage.includes(`<@U0821DG2BJ6>`)) {
          console.log(`Bot mentioned by user ${userId} in channel ${channel}: ${userMessage}`);
  
          // Get OpenAI response
          try {
            const responseText = await getOpenAIResponse(userMessage);
  
            // Send the OpenAI response back to the channel
            await slackClient.chat.postMessage({
              channel,
              text: `<@${userId}> ${responseText}`, // Reply with mention
            });
  
            return NextResponse.json({ status: "ok" });
          } catch (error) {
            console.error("Error processing the message:", error);
            return NextResponse.json({
              status: "error",
              message: "Failed to process the message",
            });
          }
        }
      }
    }
  
    return NextResponse.json({ status: "ok" });
  }
