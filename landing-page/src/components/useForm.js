import Box from '@mui/material/Box';
import React, {useState} from 'react';

export function useForm(initialFValues, validateOnChange = false, validate) {
  const [values, setValues] = useState(initialFValues);
  const [errors, setErrors] = useState({});

  const handleInputChange = (e) => {
    const {name, value} = e.target;
    setValues({
      ...values,
      [name]: value,
    });
    if (validateOnChange) validate({[name]: value});
  };

  const resetForm = () => {
    setValues(initialFValues);
    setErrors({});
  };

  return {
    values,
    setValues,
    errors,
    setErrors,
    handleInputChange,
    resetForm,
  };
}

const formStyles = {
  root: {
    '& .MuiFormControl-root': {
      width: '80%',
      margin: '8px',
    },
  },
};

export function Form(props) {
  const {children, ...other} = props;
  return (
    <Box component="form" sx={formStyles.root} autoComplete="off" {...other}>
      {props.children}
    </Box>
  );
}
