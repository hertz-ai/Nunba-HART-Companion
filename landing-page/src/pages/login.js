// import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
// import MuiAlert from "@mui/lab/Alert";
// redirect

// import { useForm } from 'react-hook-form';
import Footer from '../components/footer';
import Navbar from '../components/navbar';
import {useForm, Form} from '../components/useForm';
import Controls from '../pages/Controls';
import {mailerApi} from '../services/socialApi';
import {authTheme, ColorButton} from '../theme/authTheme';
import {logger} from '../utils/logger';

import {faUser} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Container from '@mui/material/Container';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import {ThemeProvider} from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';

const sxStyles = {
  paper: {
    marginTop: '64px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#212A31',
  },
  avatar: {
    margin: '8px',
  },
  form: {
    width: '100%', // Fix IE 11 issue.
    marginTop: '8px',
  },
  submit: {
    margin: '24px 0 16px',
  },
};

const initialFValues = {
  phoneNumber: '',
  otp: '',
};

// ####
export default function Login() {
  const navigate = useNavigate();
  const [otpView, setOtpView] = useState(true);
  const [alert, setAlert] = useState(false);
  const [alertContent, setAlertContent] = useState('');
  useEffect(() => {
    const access_token = localStorage.getItem('hevolve_access_token');
    if (access_token != null) {
      if (access_token.trim().length != 0) {
        navigate('/teacher/home');
      }
    }
  }, []);

  // Form validation!!
  // ===========================================================
  const validate = (fieldValues = values) => {
    logger.log('fieldValues !!');
    logger.log(fieldValues);
    const temp = {...errors};
    if ('phoneNumber' in fieldValues)
      temp.phoneNumber =
        fieldValues.phoneNumber.length > 9
          ? ''
          : 'Minimum 10 numbers required.';
    setErrors({
      ...temp,
    });

    if (fieldValues == values) return Object.values(temp).every((x) => x == '');
  };

  const {values, setValues, errors, setErrors, handleInputChange, resetForm} =
    useForm(initialFValues, true, validate);
  // ===========================================================

  const [access_token, setAccessToken] = React.useState(
    localStorage.getItem('hevolve_access_token')
  );
  const postLogin = (event) => {
    // function postLogin() {
    event.preventDefault();

    // call the db access app to verify user is valid
    mailerApi
      .verifyOtp({
        phone_number: document.getElementById('phoneNumber').value,
        otp: document.getElementById('otp').value,
      })
      .then((result) => {
        // mailerApi auto-unwraps response.data
        logger.log('The response from verify teacher -> success');
        localStorage.setItem('hevolve_access_token', result.access_token);
        navigate('/teacher/home');
      })
      .catch((e) => {
        logger.log('Exception -> ' + e);
        setAlertContent('Invalid OTP');
        setAlert(true);
        return false;
      });

    resetForm();
  };

  const getotp = (event) => {
    event.preventDefault();
    logger.log('Entered getotp()');
    if (validate()) {
      logger.log('validation successful..');
    } else {
      return false;
    } // call the db access app to verify user is valid
    mailerApi
      .verifyTeacherByPhone({
        phone_number: document.getElementById('phoneNumber').value,
      })
      .then((result) => {
        // mailerApi auto-unwraps response.data
        if (result?.detail) {
          setAlertContent(result.detail);
          setAlert(true);
        } else {
          logger.log('Teacher found in database, verify otp');
          setOtpView(!otpView);
          setAlert(false);
        }
      })
      .catch((e) => {
        logger.log('Exception -> ' + e);
        return false;
      });
  };
  return (
    <>
      <ThemeProvider theme={authTheme}>
        <Navbar />
        <section
          style={{
            marginTop: '4rem',
            backgroundImage: `url('./HevolveBanner.png')`,
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
          }}
          className="relative mt-5 overflow-hidden h-screen flex items-center"
        >
          <Container component="main" maxWidth="xs">
            <div
              style={{
                background:
                  'rgba(115, 120, 132, 0.2)' /* White with transparency */,
                borderRadius: '10px' /* Optional: adds rounded corners */,
                padding:
                  '20px' /* Optional: adds some padding inside the div */,
                backdropFilter:
                  'blur(10px)' /* Blur effect on the background */,
                border:
                  '1px solid rgba(255, 255, 255, 0.18)' /* Optional: adds a light border */,
              }}
              style={sxStyles.paper}
            >
              {/* <Avatar className={classes.avatar}>
          <LockOutlinedIcon />
          </Avatar> */}
              <FontAwesomeIcon
                icon={faUser}
                color="#0078ff"
                size="lg"
                style={sxStyles.avatar}
              ></FontAwesomeIcon>
              <Typography component="h1" variant="h5">
                AI Agent Sign In
              </Typography>
              {alert ? <Alert severity="error">{alertContent}</Alert> : <></>}
              <form style={sxStyles.form} onSubmit={postLogin}>
                <Controls.Input
                  name="phoneNumber"
                  id="phoneNumber"
                  type="number"
                  label="Phone Number"
                  value={values.phoneNumber}
                  onChange={handleInputChange}
                  error={errors.phoneNumber}
                />
                {!otpView ? (
                  <Controls.Input
                    name="otp"
                    id="otp"
                    label="OTP"
                    type="number"
                    value={values.otp}
                    onChange={handleInputChange}
                    error={errors.otp}
                  />
                ) : (
                  <></>
                )}

                {/* <Button
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            className={classes.submit}
          >
            Sign In
          </Button> */}
                {otpView ? (
                  <ColorButton
                    variant="contained"
                    color="#0078ff"
                    fullWidth
                    onClick={getotp}
                    type="button"
                  >
                    Get otp
                  </ColorButton>
                ) : (
                  <ColorButton
                    variant="contained"
                    color="#0078ff"
                    fullWidth
                    sx={sxStyles.submit}
                    type="submit"
                  >
                    Sign in
                  </ColorButton>
                )}

                <Grid container>
                  <Grid item>
                    <Link href="/" variant="body2">
                      {"Don't have an account? Sign Up"}
                    </Link>
                  </Grid>
                </Grid>
              </form>
            </div>
          </Container>
        </section>
        <Footer />
      </ThemeProvider>
    </>
  );
}
