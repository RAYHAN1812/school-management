import { useCallback, useState } from 'react';
import { getErrorCode, getErrorMessage, getFieldErrors } from '../utils/errors';

/**
 * Minimal form state: values, per-field errors and a top-level submit error.
 * `bind(name)` wires an input; `handleApiError` maps server validation details
 * (and known error codes) back onto fields.
 */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setValue = useCallback((name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  const bind = (name) => ({
    name,
    value: values[name] ?? '',
    onChange: (e) => setValue(name, e.target.value),
    error: errors[name],
  });

  /** codeMap: { DUPLICATE_STUDENT_ID: 'studentCode' } puts that error on a field. */
  function handleApiError(err, codeMap = {}) {
    const field = codeMap[getErrorCode(err)];
    if (field) {
      setErrors((e) => ({ ...e, [field]: getErrorMessage(err) }));
      return;
    }
    const fields = getFieldErrors(err);
    if (Object.keys(fields).length) {
      setErrors(fields);
      setSubmitError('Please fix the highlighted fields.');
    } else {
      setSubmitError(getErrorMessage(err));
    }
  }

  /** Wrap a submit handler: runs client validation, then the async action. */
  const submit = (validate, action) => async (e) => {
    e?.preventDefault();
    const found = validate ? validate(values) : {};
    setErrors(found);
    if (Object.keys(found).length) {
      setSubmitError('Please fix the highlighted fields.');
      return;
    }
    setSubmitError('');
    setSubmitting(true);
    try {
      await action(values);
    } finally {
      setSubmitting(false);
    }
  };

  return { values, setValues, setValue, bind, errors, setErrors, submitError, setSubmitError, submitting, handleApiError, submit };
}

// Small validators shared by forms.
export const isEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v).trim());
export const isPhone = (v) => /^\+?[0-9\s-]{7,20}$/.test(String(v).trim());
/** Today's *local* date as YYYY-MM-DD (toISOString would give the UTC date). */
export const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
