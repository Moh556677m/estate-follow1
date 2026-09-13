import React from 'react';
import CountryField from '@/components/CountryField';

/**
 * Unified country / nationality selector — same UI as CountryField.
 * Displays country NAME only (no ISO, no calling code).
 * Dial codes remain only in PhoneField.
 */
const NationalityField = (props) => <CountryField {...props} />;

export default NationalityField;
