import { GoogleGenAI } from "@google/genai";

const ai= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
})

async function testGemini(){
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: "Say hello how are you in German in exactly one sentence."
     
    })
    console.log(response.text);
}

testGemini()