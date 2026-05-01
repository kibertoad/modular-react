// Headless module: contributes only navigation, no routes/component/zones.
export default {
  id: "headless-helper",
  version: "0.1.0",
  meta: { name: "Helper", ownerTeam: "platform" },
  navigation: [{ label: "Helper", to: "/helper", hidden: true }],
};
