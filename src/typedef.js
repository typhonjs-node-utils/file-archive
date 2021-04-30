/**
 * @typedef {object} FileArchiveOptions
 *
 * @property {string} [compressFormat] - The compression format / `tar.gz` or `zip`.
 *
 * @property {boolean} [lockRelative] - Once set to true this prevents the relative path from being changed.
 *
 * @property {string} [logEvent] - The event name to invoke for logging with any associated Eventbus.
 *
 * @property {string} [relativePath] - Defines a relative path that will be the target directory to write / copy to and
 *                                     empty.
 */
