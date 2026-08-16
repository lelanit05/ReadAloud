export const PASSAGES = [
  {
    id: "cafe",
    title: "Shall we sit down?",
    level: "Hội thoại",
    text: "Hi, do you have a minute? I am looking for a quiet cafe nearby. The one on the corner has good coffee and some tables by the window. We can sit there and talk after work. Does that sound good to you?",
  },
  {
    id: "sun",
    title: "The morning sun",
    level: "Dễ",
    text: "The sun comes up over the quiet street. Birds sing in the old green tree. A small cat sits by the door and waits. People walk to work with warm coffee in their hands. It is a good day to begin again.",
  },
  {
    id: "market",
    title: "At the market",
    level: "Trung bình",
    text: "Mia walks through the busy market and looks for ripe tomatoes. The air smells like bread, oranges, and rain. She counts her coins and buys a loaf for her grandmother. A boy almost drops a basket of apples, but she helps him just in time. They both laugh and go back to their Saturday plans.",
  },
  {
    id: "library",
    title: "The last book",
    level: "Khó hơn",
    text: "Daniel thought the library was empty until he heard a page turn behind the tall shelves. An old woman looked up and smiled as if she had been waiting. She handed him a thin book with a blue cover and said he should finish it before winter. He did not understand, but he promised anyway. That night, the first sentence made him forget the time.",
  },
];

export function splitSentences(text) {
  const cleaned = text.trim().replace(/\s+/g, " ");
  const parts = cleaned.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || [cleaned];
  return parts.map((part) => part.trim()).filter(Boolean);
}
