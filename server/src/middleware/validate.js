/**
 * Validate and replace req.body / req.query / req.params with parsed Zod output.
 * Usage: validate({ body: schema, query: schema })
 * Zod errors are turned into 400 VALIDATION_ERROR by the error handler.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    try {
      for (const key of ['params', 'query', 'body']) {
        if (schemas[key]) {
          const parsed = schemas[key].parse(req[key] ?? {});
          // req.query is a getter in Express 5; assign defensively.
          Object.defineProperty(req, key, { value: parsed, writable: true, configurable: true, enumerable: true });
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
