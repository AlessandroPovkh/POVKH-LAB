const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export const resolveSocialLinks = ({ definitions, environment = {}, production = false }) => {
  if (!Array.isArray(definitions)) throw new Error("Social link definitions must be an array");

  const ids = new Set();
  const destinations = new Set();
  const links = [];

  for (const definition of definitions) {
    if (!Array.isArray(definition) || definition.length < 3 || definition.length > 4) {
      throw new Error("Every social link definition must contain id, label, environment key and optional default");
    }
    const [id, label, environmentKey, approvedDefault = ""] = definition;
    if (![id, label, environmentKey].every((value) => typeof value === "string" && value.trim())) {
      throw new Error("Social link definition fields must be non-empty strings");
    }
    if (ids.has(id)) throw new Error("Social link IDs must be unique");
    ids.add(id);

    const rawValue = hasOwn(environment, environmentKey) ? environment[environmentKey] : approvedDefault;
    const value = String(rawValue ?? "").trim();
    if (!value) continue;

    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${environmentKey} must be an absolute HTTPS URL without credentials`);
    }
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      throw new Error(`${environmentKey} must be an absolute HTTPS URL without credentials`);
    }
    if (destinations.has(url.href)) throw new Error("Social link destinations must be unique");
    destinations.add(url.href);
    links.push(Object.freeze({ id, label, url: url.href }));
  }

  if (production && links.length === 0) {
    throw new Error("Production links page requires at least one verified social destination");
  }
  return Object.freeze(links);
};
