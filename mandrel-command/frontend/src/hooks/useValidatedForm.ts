/**
 * TR003-6: Validated Form Hook
 * Provides real-time validation with backend integration and error handling
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Form, FormInstance } from 'antd';
import { z } from 'zod';
import { validateData, validatePartial, formatFieldErrors, type FormFieldError } from '../validation/schemas';
import { useErrorHandler } from './useErrorHandler';
import { mandrelApi } from '../api/mandrelApiClient';

export interface ValidatedFormConfig<T> {
  schema: z.ZodSchema<T>;
  componentName: string;
  enableRealTimeValidation?: boolean;
  debounceMs?: number;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  enableServerValidation?: boolean;
  onSubmitSuccess?: (data: T) => void;
  onSubmitError?: (error: any) => void;
  onValidationError?: (errors: FormFieldError[]) => void;
}

export interface ValidatedFormState<T> {
  data: Partial<T>;
  errors: Record<string, string>;
  isValidating: boolean;
  isSubmitting: boolean;
  isValid: boolean;
  hasBeenModified: boolean;
  serverErrors: Record<string, string>;
}

export interface ValidatedFormActions<T> {
  setFieldValue: (field: keyof T, value: any) => void;
  setFieldsValue: (fields: Partial<T>) => void;
  validateField: (field: keyof T) => Promise<boolean>;
  validateForm: () => Promise<boolean>;
  submitForm: () => Promise<T | undefined>;
  resetForm: () => void;
  clearErrors: () => void;
  clearServerErrors: () => void;
}

const DEFAULT_CONFIG = {
  enableRealTimeValidation: true,
  debounceMs: 300,
  validateOnChange: true,
  validateOnBlur: true,
  enableServerValidation: false,
};

export const useValidatedForm = <T extends Record<string, any>>(
  config: ValidatedFormConfig<T>
): {
  form: [FormInstance];
  formState: ValidatedFormState<T>;
  formActions: ValidatedFormActions<T>;
  errorHandler: ReturnType<typeof useErrorHandler>;
} => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const [form] = Form.useForm();

  // Error handler integration with TR002-6
  const errorHandler = useErrorHandler({
    componentName: `${finalConfig.componentName}Form`,
    enableAutoRetry: false, // Forms don't auto-retry
    showUserMessages: false, // We handle messages in the form
    reportToAidis: true,
  });

  // Form state
  const [formState, setFormState] = useState<ValidatedFormState<T>>({
    data: {},
    errors: {},
    isValidating: false,
    isSubmitting: false,
    isValid: false,
    hasBeenModified: false,
    serverErrors: {},
  });

  // Debouncing refs
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const validationCacheRef = useRef<Map<string, any>>(new Map());

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Debounced validation function
  const debouncedValidate = useCallback((field?: keyof T, value?: any) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      if (field && value !== undefined) {
        validateField(field);
      } else {
        validateForm();
      }
    }, finalConfig.debounceMs);
  }, [finalConfig.debounceMs]);

  // Validate single field
  const validateField = useCallback(async (field: keyof T): Promise<boolean> => {
    const fieldValue = form.getFieldValue(field as string);
    const cacheKey = `${String(field)}_${JSON.stringify(fieldValue)}`;

    // Check cache to avoid redundant validation
    if (validationCacheRef.current.has(cacheKey)) {
      return validationCacheRef.current.get(cacheKey);
    }

    try {
      // For single field validation, use the partial schema validation
      const result = validatePartial(finalConfig.schema, { [field]: fieldValue });

      const isValid = result.success;
      validationCacheRef.current.set(cacheKey, isValid);

      setFormState(prev => ({
        ...prev,
        errors: {
          ...prev.errors,
          [field]: result.errors?.find(e => e.field === String(field))?.message || '',
        },
      }));

      return isValid;
    } catch (error) {
      console.warn('Field validation error:', error);
      return false;
    }
  }, [form, finalConfig.schema]);

  // Validate entire form
  const validateForm = useCallback(async (): Promise<boolean> => {
    setFormState(prev => ({ ...prev, isValidating: true }));

    try {
      const formData = form.getFieldsValue();
      const result = validateData(finalConfig.schema, formData);

      const errors = result.errors ? formatFieldErrors(result.errors) : {};
      const isValid = result.success;

      setFormState(prev => ({
        ...prev,
        data: formData,
        errors,
        isValid,
        isValidating: false,
      }));

      if (!isValid && finalConfig.onValidationError) {
        finalConfig.onValidationError(result.errors || []);
      }

      return isValid;
    } catch (error) {
      errorHandler.handleError(error as Error);
      setFormState(prev => ({
        ...prev,
        isValidating: false,
        isValid: false,
      }));
      return false;
    }
  }, [form, finalConfig.schema, finalConfig.onValidationError, errorHandler]);

  // Server-side validation (optional)
  const validateWithServer = useCallback(async (data: T): Promise<{
    success: boolean;
    errors?: Record<string, string>;
  }> => {
    if (!finalConfig.enableServerValidation) {
      return { success: true };
    }

    try {
      // Store validation context in AIDIS for server-side validation
      const validationContext = {
        component: finalConfig.componentName,
        schema: finalConfig.schema.description || 'unknown',
        data: JSON.stringify(data, null, 2),
        timestamp: new Date().toISOString(),
      };

      await mandrelApi.storeContext(
        `Form validation for ${finalConfig.componentName}`,
        'validation',
        ['form-validation', finalConfig.componentName.toLowerCase()]
      );

      // TODO: Implement actual server-side validation endpoint when available
      // For now, return success
      return { success: true };
    } catch (error) {
      console.warn('Server validation error:', error);
      return {
        success: false,
        errors: { general: 'Server validation failed' },
      };
    }
  }, [finalConfig.enableServerValidation, finalConfig.componentName, finalConfig.schema]);

  // Set field value with validation
  const setFieldValue = useCallback((field: keyof T, value: any) => {
    form.setFieldValue(field as string, value);

    setFormState(prev => ({
      ...prev,
      data: { ...prev.data, [field]: value },
      hasBeenModified: true,
      serverErrors: { ...prev.serverErrors, [field]: '' }, // Clear server error for this field
    }));

    if (finalConfig.enableRealTimeValidation && finalConfig.validateOnChange) {
      debouncedValidate(field, value);
    }
  }, [form, finalConfig.enableRealTimeValidation, finalConfig.validateOnChange, debouncedValidate]);

  // Set multiple field values
  const setFieldsValue = useCallback((fields: Partial<T>) => {
    form.setFieldsValue(fields);

    setFormState(prev => ({
      ...prev,
      data: { ...prev.data, ...fields },
      hasBeenModified: true,
      // Clear server errors for updated fields
      serverErrors: Object.keys(fields).reduce((acc, key) => {
        acc[key] = '';
        return acc;
      }, { ...prev.serverErrors }),
    }));

    if (finalConfig.enableRealTimeValidation && finalConfig.validateOnChange) {
      debouncedValidate();
    }
  }, [form, finalConfig.enableRealTimeValidation, finalConfig.validateOnChange, debouncedValidate]);

  // Submit form with validation
  const submitForm = useCallback(async (): Promise<T | undefined> => {
    setFormState(prev => ({ ...prev, isSubmitting: true, serverErrors: {} }));

    try {
      // Client-side validation
      const isValid = await validateForm();
      if (!isValid) {
        setFormState(prev => ({ ...prev, isSubmitting: false }));
        return undefined;
      }

      const formData = form.getFieldsValue();
      const result = validateData(finalConfig.schema, formData);

      if (!result.success) {
        const errors = result.errors ? formatFieldErrors(result.errors) : {};
        setFormState(prev => ({
          ...prev,
          errors,
          isSubmitting: false,
        }));
        return undefined;
      }

      const validatedData = result.data!;

      // Server-side validation (if enabled)
      const serverValidation = await validateWithServer(validatedData);
      if (!serverValidation.success) {
        setFormState(prev => ({
          ...prev,
          serverErrors: serverValidation.errors || {},
          isSubmitting: false,
        }));
        return undefined;
      }

      // Success callback
      if (finalConfig.onSubmitSuccess) {
        finalConfig.onSubmitSuccess(validatedData);
      }

      setFormState(prev => ({
        ...prev,
        isSubmitting: false,
        hasBeenModified: false,
      }));

      return validatedData;
    } catch (error) {
      errorHandler.handleError(error as Error);
      if (finalConfig.onSubmitError) {
        finalConfig.onSubmitError(error);
      }

      setFormState(prev => ({ ...prev, isSubmitting: false }));
      return undefined;
    }
  }, [
    form,
    finalConfig.schema,
    finalConfig.onSubmitSuccess,
    finalConfig.onSubmitError,
    validateForm,
    validateWithServer,
    errorHandler,
  ]);

  // Reset form
  const resetForm = useCallback(() => {
    form.resetFields();
    setFormState({
      data: {},
      errors: {},
      isValidating: false,
      isSubmitting: false,
      isValid: false,
      hasBeenModified: false,
      serverErrors: {},
    });
    validationCacheRef.current.clear();
    errorHandler.clearError();
  }, [form, errorHandler]);

  // Clear client-side errors
  const clearErrors = useCallback(() => {
    setFormState(prev => ({ ...prev, errors: {} }));
  }, []);

  // Clear server-side errors
  const clearServerErrors = useCallback(() => {
    setFormState(prev => ({ ...prev, serverErrors: {} }));
  }, []);

  // Form field event handlers for real-time validation
  const handleFieldChange = useCallback((field: keyof T) => (value: any) => {
    setFieldValue(field, value);
  }, [setFieldValue]);

  const handleFieldBlur = useCallback((field: keyof T) => () => {
    if (finalConfig.enableRealTimeValidation && finalConfig.validateOnBlur) {
      validateField(field);
    }
  }, [finalConfig.enableRealTimeValidation, finalConfig.validateOnBlur, validateField]);

  // Enhanced form instance with validation events
  const enhancedForm = [form] as [FormInstance];

  return {
    form: enhancedForm,
    formState,
    formActions: {
      setFieldValue,
      setFieldsValue,
      validateField,
      validateForm,
      submitForm,
      resetForm,
      clearErrors,
      clearServerErrors,
    },
    errorHandler,
  };
};