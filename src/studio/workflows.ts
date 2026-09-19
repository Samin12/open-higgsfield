export const stages = [
  "Brief",
  "Ready",
  "In progress",
  "Review",
  "Approved",
] as const;
export const workflows = [
  {
    id: "character-recast",
    title: "Put yourself in the scene",
    category: "Character",
    description:
      "Build a strong likeness, transfer the performance, then review and finish.",
    model: "genjutsu-motion",
    image: "/workflows/character.jpg",
    steps: [
      "Upload a 4–30 second source clip",
      "Add clear face references from multiple angles",
      "Prepare and review your scene keyframe",
      "Quote and generate motion transfer",
      "Check likeness, restore audio and approve",
    ],
    prompt:
      "Transfer the source performance to the person in the reference image. Preserve the reference person's facial identity, face proportions and hair through every turn. Keep the scene, clothing, choreography and camera movement from the source. Additional photos are identity references only.",
  },
  {
    id: "object-swap",
    title: "Recast a video",
    category: "Video edit",
    description:
      "Change a character or product while keeping the original shot.",
    model: "genjutsu-swap",
    image: "/workflows/recast.jpg",
    steps: [
      "Upload the source clip",
      "Add a replacement reference",
      "Describe what changes and what stays",
      "Review the quote and generate",
      "Compare versions and request changes",
    ],
    prompt:
      "Replace only the main subject with the reference subject. Preserve the source composition, lighting, clothing, surrounding people and camera movement.",
  },
  {
    id: "image-to-video",
    title: "Bring a still to life",
    category: "Animation",
    description: "Turn an approved image into a short cinematic clip.",
    model: "kling-3-std",
    image: "/workflows/animate.jpg",
    steps: [
      "Upload your approved starting frame",
      "Describe the motion",
      "Set duration and audio",
      "Review the quote and generate",
      "Review with your client",
    ],
    prompt:
      "A cinematic, natural movement. Preserve the subject's identity and composition from the starting frame.",
  },
  {
    id: "custom",
    title: "Build your own workflow",
    category: "Custom",
    description:
      "Choose a model, attach your references and keep each iteration together.",
    model: "seedance-2.5",
    image: "/workflows/custom.jpg",
    steps: [
      "Write the brief",
      "Choose a model and references",
      "Set the generation options",
      "Review the quote",
      "Generate, review and approve",
    ],
    prompt: "",
  },
];
