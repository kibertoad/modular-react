// Object-map style: a single barrel exports an object whose values are
// descriptors keyed by id. Used to validate the `objectMap` resolver.
export default {
  alpha: {
    id: "alpha",
    version: "1.0.0",
    meta: { name: "Alpha", ownerTeam: "team-a" },
    slots: { commands: [] },
  },
  beta: {
    id: "beta",
    version: "2.1.0",
    meta: { name: "Beta", ownerTeam: "team-b", tags: ["experimental"] },
    component: () => null,
  },
};
