/* eslint-disable */
import React, {useEffect, useState} from 'react';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import {Autocomplete} from '@mui/lab';
import Link from '@mui/material/Link';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import {styled} from '@mui/material/styles';
import Box from '@mui/material/Box';
import {alpha} from '@mui/material/styles';
import {Backdrop, InputAdornment} from '@mui/material/';
import CircularProgress from '@mui/material/CircularProgress';
// get our fontawesome imports
import {faUserPlus} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import Chip from '@mui/material/Chip';
import Select from '@mui/material/Select';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Input from '@mui/material/Input';
import Snackbar from '@mui/material/Snackbar';
import {SnackbarContent} from '@mui/material';
import Spacer from './Spacer';
import logo_dark from './../images/logo-dark.png';
import HeaderNano from '../pages/Layouts/header';
import MuiPhoneNumber from 'material-ui-phone-number';
import {v4 as uuidv4} from 'uuid';
import VerifiedIcon from '@mui/icons-material/Verified';

import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import './RegisterClient.scss';
import {useNavigate} from 'react-router-dom';
import { mailerApi } from '../services/socialApi';
import AppBar from '@mui/material/AppBar';
import Button from '@mui/material/Button';
import {green, purple} from '@mui/material/colors';
import Container from '@mui/material/Container';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import {withStyles, useTheme} from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Alert from '@mui/lab/Alert';
import { logger } from '../utils/logger';

const sxStyles = {
  paper: {
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
  },
  avatar: {
    margin: '8px',
  },
  formControl: {
    margin: '24px',
    minWidth: 120,
    maxWidth: 600,
    float: 'left',
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
  },
  chip: {
    margin: 2,
  },
  radioGroup: {
    margin: '0px',
  },
  submit: {
    // used on ColorButton
  },
};
const BootstrapDialog = styled(Dialog)(({theme}) => ({
  '& .MuiDialogContent-root': {
    padding: theme.spacing(2),
  },
  '& .MuiDialogActions-root': {
    padding: theme.spacing(1),
  },
}));

const ColorButton = withStyles((theme) => ({
  root: {
    width: '70%',
    color: theme.palette.getContrastText(purple[500]),
    // color: "linear-gradient(to right, #00e89d, #0078ff)",
    background: 'linear-gradient(to right, #00e89d, #0078ff)',
    // backgroundColor: purple[500],
    '&:hover': {
      backgroundColor: purple[700],
    },
    '&:focus': {
      outline: 'none',
    },
  },
}))(Button);

const GreenRadio = withStyles({
  root: {
    '&$checked': {
      // color: green[600],
      color: '#f800a4',
    },
  },
  checked: {},
})((props) => <Radio color="default" {...props} />);

const names = [
  'AI Assessment',
  'AI Conversation For Improving English',
  'AI Interview',
  'AI Revision',
];

function getStyles(name, personName, theme) {
  return {
    fontWeight:
      personName.indexOf(name) === -1
        ? theme.typography.fontWeightRegular
        : theme.typography.fontWeightMedium,
  };
}
export default function Register() {
  const navigate = useNavigate();
  const [userType, setUserType] = React.useState('business');
  const [alert, setAlert] = useState(false);
  const [alertContent, setAlertContent] = useState('');
  const [APIs, setAPIList] = React.useState({name: '', is_active: true});
  const [apiNames, setAPINames] = React.useState([]);
  const [apiNamesDict, setAPINamesDict] = React.useState([
    {name: '', is_active: true},
  ]);
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const [openError, setOpenError] = React.useState(false);
  const [message, setMessage] = React.useState(false);
  const [messageData, setMessageData] = React.useState(
    'Welcome to Hevolve, Thankyou for being a part of us, Our Executive will contact you shortly.'
  );
  const [loading, setLoading] = React.useState(false);
  const [language_perferred, setLanguage] = React.useState('');
  const [gender, setGender] = React.useState('');
  const [whoPays, setWhoPays] = React.useState('');
  const [dateOfBirth, setDateOfBirth] = React.useState(new Date());
  const [proficiency, setProficiency] = React.useState('');
  const today = new Date();
  const [clients, setClients] = React.useState([]);
  const [clientid, setClientId] = React.useState(0);
  const [grades, setGrades] = React.useState([]);
  const [grade, setgrade] = React.useState('1');
  const [clientSecret, setClientSecret] = React.useState('');
  const [businessName, setBusinessName] = React.useState('');
  const [businessMail, setBusinessMail] = React.useState('');

  const [emailError, setEmailError] = useState(false);
  const [emailError1, setEmailError1] = useState(false);
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [otp, setOtp] = useState('');
  const [verificationResponse, setVerificationResponse] = useState(null);
  const [otpVerificationResponse, setOtpVerificationResponse] = useState(null);
  const [isPhoneVerification, setIsPhoneVerification] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerificationError, setOtpVerificationError] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [errormsg, setError] = useState();
  useEffect(() => {}, [isOtpVerified]);
  function ValidateEmail(event) {
    if (
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(event.target.value)
    ) {
      if (event.target.name == 'indvEmail') {
        setEmailError1(false);
      } else {
        setEmailError(false);
      }
    } else {
      if (event.target.name == 'indvEmail') {
        setEmailError1(true);
      } else {
        setEmailError(true);
      }
    }
  }
  const handlePhoneVerification = async () => {
    if (!phoneNumber) {
      setErrorMessage('Please enter your phone number');
      return;
    }

    try {
      const result = await mailerApi.sendOtp({
        phone_number: phoneNumber,
      });
      // mailerApi auto-unwraps response.data
      setVerificationResponse(result);
      setIsPhoneVerification(false);
      setErrorMessage('');
      setOtpSent(true);
    } catch (error) {
      console.error('Error sending OTP:', error);
      setErrorMessage('Error sending OTP');
      setOtpVerificationError(true);
    }
  };

  const handleOtpVerification = async () => {
    if (!otp) {
      setErrorMessage('Please enter the OTP');
      return;
    }

    try {
      // mailerApi auto-unwraps response.data
      const result = await mailerApi.validateOtp({
        phone_number: phoneNumber,
        otp: otp,
      });
      setOtpVerificationResponse(result);
      setErrorMessage('');
      if (result.status === 'verified') {
        setIsOtpVerified(true);
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      setErrorMessage('Error verifying OTP');
      setOtpVerificationError(true);
    }
  };

  const fetchClient = async () => {
    mailerApi.allClients()
      .then((data) => {
        setClients(data);
      })
      .catch((error) => {
        logger.log(error);
        setAlertContent('unable to fetch clients list, please try again');
        setAlert(true);
      });
  };
  const fetchGrade = async () => {
    mailerApi.getStandards()
      .then((data) => {
        setGrades(data);
      })
      .catch((error) => {
        logger.log(error);
        setAlertContent('unable to fetch clients list, please try again');
        setAlert(true);
      });
  };

  useEffect(() => {
    fetchClient();
    fetchGrade();
  }, []);
  function handleClose(event, reason) {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
    setOpenError(false);
    setOtpSent(false);
    setOtpVerificationError(false);
  }

  const handleUserSelect = (event) => {
    if (event.target.value == 'individual') {
      setUserType('individual');
      document.getElementById('indvForm').style.display = 'block';
      document.getElementById('businessForm').style.display = 'none';
    } else {
      setUserType('business');
      document.getElementById('indvForm').style.display = 'none';
      document.getElementById('businessForm').style.display = 'block';
    }
  };
  const handleClickClose = () => {
    setMessage(false);
    // window.location.reload(false);
    const individualDataDetails = {
      name: document.getElementById('indvUsername').value,
      gender: gender,
      dob: dateOfBirth,
      phone_number: phoneNumber,
      email_address: document.getElementById('indvEmail').value,
      who_pays_for_course: whoPays,
      english_proficiency: proficiency,
      preferred_language: language_perferred,
      category: 'School',
      client_id: clientid,
      client_secret: clientSecret,
      boardOrSpecializationOrProfession: 'BCA',
      stdorSemOrGoalOrCourseOrExamName: grade,
      transliteration: true,
      // Add other properties as needed
    };

    navigate('/plan', {
      state: {userData: individualDataDetails},
    });
  };

  const handleClientChange = (newValue) => {
    for (let i = 0; i < clients.length; i++) {
      if (clients[i].name == newValue) {
        setClientId(clients[i].client_id);
        {
          break;
        }
      }
    }
  };
  const handleChange = (event) => {
    // update the apis queue
    setAPINames(event.target.value);
    const tempAPIs = event.target.value;
    let tempAPIJson = {};
    const tempAPIJsonArray = [];
    for (let i = 0; i < tempAPIs.length; i++) {
      tempAPIJson['name'] = tempAPIs[i];
      tempAPIJson['is_active'] = true;
      tempAPIJsonArray.push(tempAPIJson);
      tempAPIJson = {};
    }
    setAPINamesDict(tempAPIJsonArray);
  };
  function convert(str) {
    const date = new Date(str);
    const mnth = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    return [date.getFullYear(), mnth, day].join('-');
  }

  const ITEM_HEIGHT = 48;
  const ITEM_PADDING_TOP = 8;
  const MenuProps = {
    PaperProps: {
      style: {
        maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
        width: 250,
      },
    },
  };

  const postIndividualUserData = (event) => {
    event.preventDefault();
    setLoading(!loading);

    const clientRegObj1 = {
      name: document.getElementById('indvUsername').value,
      gender: gender,
      dob: dateOfBirth,
      phone_number: phoneNumber,
      email_address: document.getElementById('indvEmail').value,
      who_pays_for_course: whoPays,
      english_proficiency: proficiency,
      preferred_language: language_perferred,
      category: 'School',
      client_id: clientid,
      client_secret: clientSecret,
      boardOrSpecializationOrProfession: 'BCA',
      stdorSemOrGoalOrCourseOrExamName: grade,
      transliteration: true,
    };

    // mailerApi auto-unwraps response.data
    mailerApi.registerStudent(clientRegObj1)
      .then((data) => {
        setLoading(false);
        if (data.response == 'failure') {
          setAlertContent(data.detail);
          setAlert(true);
          setOpenError(true);
          return;
        }
        logger.log(data.detail);
        setMessageData(data.detail);
        setMessage(!message);
        setOpen(true);
      })
      .catch((error) => {
        setLoading(false);
        const detail = error?.detail;
        if (detail) {
          setAlertContent(detail);
          setError(detail);
          setAlert(true);
          setOpenError(true);
        }
      });
  };

  const postData = (event) => {
    event.preventDefault();
    setLoading(!loading);

    const clientRegObj = {
      name: businessName,
      num_of_students: isNaN(
        parseInt(document.getElementById('numOfStudents').value)
      )
        ? 0
        : parseInt(document.getElementById('numOfStudents').value),
      phone_number: phoneNumber,
      email_address: businessMail,
      apis: apiNamesDict,
    };

    // mailerApi auto-unwraps response.data
    mailerApi.createClient(clientRegObj)
      .then((data) => {
        setLoading(false);
        if (data) {
          setMessage(!message);
          setOpen(true);

          const businessData = {
            name: businessName,
            num_of_students: isNaN(
              parseInt(document.getElementById('numOfStudents').value)
            )
              ? 0
              : parseInt(document.getElementById('numOfStudents').value),
            phone_number: phoneNumber,
            email_address: businessMail,
          };

          navigate('/plan', {
            state: {userData: businessData},
          });
        } else {
          console.error('Empty response or unable to parse as JSON.');
        }
      })
      .catch((error) => {
        setLoading(false);
        const detail = error?.detail;
        if (detail) {
          setOpen(true);
          setError(detail);
          logger.log('Server response detail:', detail);
        }
        console.error('Error:', error);
      });
  };

  function handleClose(event, reason) {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
    setOpenError(false);
  }
  const signup = async (event) => {
    postData(event);
    event.preventDefault();
  };
  return (
    <React.Fragment>
      <Container component="main" maxWidth="md">

        <div
          style={{paddingBottom: '20px', display: 'flex', paddingLeft: '45%'}}
        >
          <Typography component="h1" variant="h5">
            Sign Up
          </Typography>
          {/* <Avatar style={sxStyles.avatar}>
            <LockOutlinedIcon />
            </Avatar> */}
          <FontAwesomeIcon
            icon={faUserPlus}
            color="#0078ff"
            size="lg"
            style={sxStyles.avatar}
          ></FontAwesomeIcon>
        </div>
        <Box sx={sxStyles.paper}>
          <FormControl component="fieldset" sx={sxStyles.formControl}>
            {/* <FormLabel component="legend">User</FormLabel> */}
            <RadioGroup
              sx={sxStyles.radioGroup}
              row
              aria-label="usergroup"
              name="userSelect"
              value={userType}
              onChange={handleUserSelect}
            >
              <FormControlLabel
                control={<Radio style={{color: '#007bff'}} />}
                value="business"
                label="Business User (Tutors, School, College, Other Educational Institutions)"
              />
              <FormControlLabel
                control={<Radio style={{color: '#007bff'}} />}
                value="individual"
                label=" Individual User (Student, Parents) "
              />
            </RadioGroup>
          </FormControl>

          {alert ? <Alert severity="error">{alertContent}</Alert> : <></>}
          <Backdrop sx={{color: '#fff', zIndex: 1}} open={loading}>
            <CircularProgress color="inherit" />
          </Backdrop>
          <form onSubmit={postData} id="businessForm">
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  autoComplete="name"
                  name="name"
                  variant="outlined"
                  required
                  fullWidth
                  id="name"
                  onChange={(e) => setBusinessName(e.target.value)}
                  label="Your Name"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  variant="outlined"
                  required
                  fullWidth
                  id="email"
                  onBlur={(e) => ValidateEmail(e)}
                  label="Email Address"
                  name="email"
                  onChange={(e) => setBusinessMail(e.target.value)}
                  autoComplete="email"
                />
                {emailError ? (
                  <span style={{color: 'red'}}>Enter a valid Email</span>
                ) : null}
              </Grid>

              <Grid item xs={12} sm={6}>
                {isPhoneVerification && !otpSent ? (
                  <MuiPhoneNumber
                    name="phoneNumber"
                    defaultCountry={'in'}
                    // onlyCountries={['in', 'es', 'gb', 'fr', 'de', 'it', 'jp', 'br']}
                    variant="outlined"
                    fullWidth
                    required
                    id="phoneNumber"
                    label="Phone Number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e)}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Button
                            color="primary"
                            variant="contained"
                            onClick={handlePhoneVerification}
                          >
                            {otpSent ? 'Resend OTP' : 'Send OTP'}
                          </Button>
                        </InputAdornment>
                      ),
                    }}
                  />
                ) : (
                  <>
                    {isOtpVerified ? (
                      <div style={{display: 'flex', alignItems: 'center'}}>
                        <MuiPhoneNumber
                          name="phoneNumber"
                          defaultCountry={'in'}
                          onlyCountries={['in', 'es']}
                          variant="outlined"
                          fullWidth
                          required
                          id="phoneNumber"
                          label="Phone Number"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e)}
                          disabled={isOtpVerified}
                        />
                        {isOtpVerified && (
                          <>
                            <VerifiedIcon
                              style={{color: 'green', marginLeft: '8px'}}
                            />
                            Verified
                          </>
                        )}
                      </div>
                    ) : (
                      <TextField
                        variant="outlined"
                        fullWidth
                        required
                        id="otp"
                        label="Enter OTP"
                        name="otp"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <Button
                                color="primary"
                                variant="contained"
                                onClick={handleOtpVerification}
                                startIcon={
                                  isOtpVerified ? (
                                    <VerifiedIcon style={{color: 'green'}} />
                                  ) : null
                                }
                              >
                                {isOtpVerified ? 'Verify' : 'Verify OTP'}
                              </Button>
                            </InputAdornment>
                          ),
                        }}
                      />
                    )}
                  </>
                )}
              </Grid>

              <Grid item xs={12}>
                <TextField
                  variant="outlined"
                  required
                  fullWidth
                  id="numOfStudents"
                  label="Number Of Students"
                  name="studentNumber"
                  type="number"
                />
              </Grid>

              <Grid item xs={12}>
                {/* <DynamicElementHandler
                  updateAPIs={updateAPIs}
                  fieldname={'APIs'}
                /> */}

                <FormControl
                  sx={sxStyles.formControl}
                  style={{width: '100%'}}
                >
                  <InputLabel id="demo-mutiple-chip-label">
                    Features Intersted
                  </InputLabel>
                  <Select
                    labelId="demo-mutiple-chip-label"
                    id="demo-mutiple-chip"
                    multiple
                    value={apiNames}
                    onChange={handleChange}
                    input={<Input id="select-multiple-chip" />}
                    renderValue={(selected) => (
                      <div style={sxStyles.chips}>
                        {selected.map((value) => (
                          <Chip
                            key={value}
                            label={value}
                            style={sxStyles.chip}
                          />
                        ))}
                      </div>
                    )}
                    MenuProps={MenuProps}
                  >
                    {names.map((name) => (
                      <MenuItem
                        key={name}
                        value={name}
                        style={getStyles(name, apiNames, theme)}
                      >
                        {name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Spacer h={40} />
            {/* Legacy submit Button removed — replaced by ColorButton below */}

            <ColorButton
              variant="contained"
              onClick={signup}
              color="primary"
              type="submit"
              style={{marginLeft: '15%', color: '#fff'}}
              disabled={!isOtpVerified}
            >
              {isOtpVerified
                ? 'Register Now'
                : 'Please Verify Phone Number First'}
            </ColorButton>

            <Snackbar
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'center',
              }}
              open={open}
              autoHideDuration={2000}
              onClose={handleClose}
            >
              <SnackbarContent
                contentprops={{
                  'aria-describedby': 'message-id',
                }}
                // prettier-ignore
                message={(
                  `Thanks for registering with HertzAI`
                )}
              />
            </Snackbar>
            <Snackbar
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'center',
              }}
              open={openError}
              autoHideDuration={2000}
              onClose={handleClose}
            >
              <SnackbarContent
                contentprops={{
                  'aria-describedby': 'message-id',
                }}
                // prettier-ignore
                message={(
                  `Looks like there was a problem, please try again !`
                )}
              />
            </Snackbar>
            <Snackbar
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'center',
              }}
              open={otpSent}
              autoHideDuration={200}
              onClose={handleClose}
            >
              <SnackbarContent
                contentprops={{
                  'aria-describedby': 'message-id',
                }}
                message="OTP sent successfully"
              />
            </Snackbar>
            <Snackbar
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'center',
              }}
              open={otpVerificationError}
              autoHideDuration={200}
              onClose={handleClose}
            >
              <SnackbarContent
                contentprops={{
                  'aria-describedby': 'message-id',
                }}
                message="Error verifying OTP"
              />
            </Snackbar>
            <Snackbar
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'center',
              }}
              open={errormsg}
              autoHideDuration={2000}
            >
              <SnackbarContent
                contentprops={{
                  'aria-describedby': 'message-id',
                }}
                // prettier-ignore
                message={errormsg}
              />
            </Snackbar>

            {/* <Grid container justify="flex-end">
              <Grid item>
                <Link href="#" variant="body2">
                  Already have an account? Sign in
                </Link>
              </Grid>
            </Grid> */}
          </form>

          <form
            onSubmit={postIndividualUserData}
            id="indvForm"
            style={{display: 'none'}}
          >
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  autoComplete="indvUsername"
                  name="indvUsername"
                  variant="outlined"
                  required
                  fullWidth
                  id="indvUsername"
                  label="Your Name"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  variant="outlined"
                  required
                  fullWidth
                  id="indvEmail"
                  onBlur={(e) => ValidateEmail(e)}
                  label="Email Address"
                  name="indvEmail"
                  autoComplete="indvEmail"
                />
                {emailError1 ? (
                  <span style={{color: 'red'}}>Enter a valid Email</span>
                ) : null}
              </Grid>

              <Grid item xs={12} sm={6}>
                {isPhoneVerification && !otpSent ? (
                  <MuiPhoneNumber
                    name="phoneNumber"
                    defaultCountry={'in'}
                    onlyCountries={['in', 'es']}
                    variant="outlined"
                    fullWidth
                    required
                    id="phoneNumber"
                    label="Phone Number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e)}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Button
                            color="primary"
                            variant="contained"
                            onClick={handlePhoneVerification}
                          >
                            {otpSent ? 'Resend OTP' : 'Send OTP'}
                          </Button>
                        </InputAdornment>
                      ),
                    }}
                  />
                ) : (
                  <>
                    {isOtpVerified ? (
                      <div style={{display: 'flex', alignItems: 'center'}}>
                        <MuiPhoneNumber
                          name="phoneNumber"
                          defaultCountry={'in'}
                          onlyCountries={['in', 'es']}
                          variant="outlined"
                          fullWidth
                          required
                          id="phoneNumber"
                          label="Phone Number"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e)}
                          disabled={isOtpVerified}
                        />
                        {isOtpVerified && (
                          <>
                            <VerifiedIcon
                              style={{color: 'green', marginLeft: '8px'}}
                            />
                            Verified
                          </>
                        )}
                      </div>
                    ) : (
                      <TextField
                        variant="outlined"
                        fullWidth
                        required
                        id="otp"
                        label="Enter OTP"
                        name="otp"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <Button
                                color="primary"
                                variant="contained"
                                onClick={handleOtpVerification}
                                startIcon={
                                  isOtpVerified ? (
                                    <VerifiedIcon style={{color: 'green'}} />
                                  ) : null
                                }
                              >
                                {isOtpVerified ? 'Verify' : 'Verify OTP'}
                              </Button>
                            </InputAdornment>
                          ),
                        }}
                      />
                    )}
                  </>
                )}
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl variant="outlined" fullWidth>
                  <InputLabel id="demo-simple-select-outlined-label">
                    Gender
                  </InputLabel>
                  <Select
                    labelId="demo-simple-select-outlined-label"
                    id="gender"
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                    label="gender"
                    defaultValue="Self"
                  >
                    <MenuItem value="Male">Male</MenuItem>
                    <MenuItem value="Female">Female</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Autocomplete
                  id="currentGrade"
                  freeSolo
                  disableClearable
                  options={grades.map((option) => option.standard)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      name="currentGrade"
                      id="currentGrade"
                      variant="outlined"
                      label="Select a Grade"
                    />
                  )}
                  onChange={(event, newValue) => setgrade(newValue)}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl variant="outlined" fullWidth>
                  <InputLabel id="demo-simple-select-outlined-label">
                    Language Preferred
                  </InputLabel>
                  <Select
                    labelId="demo-simple-select-outlined-label"
                    id="languagePreferred"
                    value={language_perferred}
                    onChange={(event) => setLanguage(event.target.value)}
                    label="Language"
                    defaultValue="english"
                  >
                    <MenuItem value="en-US">English</MenuItem>
                    <MenuItem value="hi-IN">Hindi</MenuItem>
                    <MenuItem value="mr-IN">Marathi</MenuItem>
                    <MenuItem value="bn-IN">Bengali</MenuItem>
                    <MenuItem value="te-IN">Telugu</MenuItem>
                    <MenuItem value="ta-IN">Tamil</MenuItem>
                    <MenuItem value="gu-IN">Gujarati</MenuItem>
                    <MenuItem value="pa-Guru-IN">Punjabi</MenuItem>
                    <MenuItem value="kn-IN">Kannada</MenuItem>
                    <MenuItem value="ml-IN">Malayalam</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl variant="outlined" fullWidth>
                  <InputLabel id="demo-simple-select-outlined-label">
                    English Proficiency
                  </InputLabel>
                  <Select
                    labelId="demo-simple-select-outlined-label"
                    id="english-proficiency"
                    value={proficiency}
                    onChange={(event) => setProficiency(event.target.value)}
                    label="English-proficiency"
                    defaultValue="Medium"
                  >
                    <MenuItem value="High">High</MenuItem>
                    <MenuItem value="Medium">Medium</MenuItem>
                    <MenuItem value="Low">Low</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl variant="outlined" fullWidth>
                  <InputLabel id="demo-simple-select-outlined-label">
                    Who pays for Course?
                  </InputLabel>
                  <Select
                    labelId="demo-simple-select-outlined-label"
                    id="who-pays"
                    value={whoPays}
                    onChange={(event) => setWhoPays(event.target.value)}
                    label="who-pays"
                    defaultValue="Self"
                  >
                    <MenuItem value="Self">Self</MenuItem>
                    <MenuItem value="Institute">Institute</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Date of Birth"
                    format="MM/dd/yyyy"
                    value={dateOfBirth}
                    onChange={(date) => setDateOfBirth(convert(date))}
                    slotProps={{
                      textField: {
                        variant: 'outlined',
                      },
                    }}
                  />
                </LocalizationProvider>
              </Grid>

              {whoPays == 'Institute' ? (
                <>
                  <Grid item xs={12} sm={6}>
                    <Autocomplete
                      id="client_name"
                      disableClearable
                      options={clients.map((option) => option.name)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          name="client_name"
                          id="client_name"
                          variant="outlined"
                          label="Select a Client"
                        />
                      )}
                      onChange={(event, newValue) =>
                        handleClientChange(newValue)
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      autoComplete="clientsecret"
                      name="clientsecret"
                      variant="outlined"
                      required
                      fullWidth
                      id="clientsecret"
                      onBlur={(event) => setClientSecret(event.target.value)}
                      label="Client Secret"
                    />
                  </Grid>
                </>
              ) : null}

              <Grid item xs={12}>
                {/* <DynamicElementHandler
                  updateAPIs={updateAPIs}
                  fieldname={'APIs'}
                /> */}

                <FormControl
                  sx={sxStyles.formControl}
                  style={{width: '100%'}}
                >
                  <InputLabel id="demo-mutiple-chip-label">
                    Features Interested
                  </InputLabel>
                  <Select
                    labelId="demo-mutiple-chip-label"
                    id="demo-mutiple-chip"
                    multiple
                    value={apiNames}
                    onChange={handleChange}
                    input={<Input id="select-multiple-chip" />}
                    renderValue={(selected) => (
                      <div style={sxStyles.chips}>
                        {selected.map((value) => (
                          <Chip
                            key={value}
                            label={value}
                            style={sxStyles.chip}
                          />
                        ))}
                      </div>
                    )}
                    MenuProps={MenuProps}
                  >
                    {names.map((name) => (
                      <MenuItem
                        key={name}
                        value={name}
                        style={getStyles(name, apiNames, theme)}
                      >
                        {name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Spacer h={40} />
            <ColorButton
              variant="contained"
              color="primary"
              type="submit"
              style={{marginLeft: '15%', color: '#fff'}}
              disabled={!isOtpVerified}
            >
              {isOtpVerified ? 'Sign Up' : 'Please Verify Phone Number First'}
            </ColorButton>
            <BootstrapDialog
              onClose={handleClickClose}
              aria-labelledby="customized-dialog-title"
              open={message}
            >
              <DialogTitle sx={{m: 0, p: 2}}>
                Thank you for Registering!
              </DialogTitle>
              <DialogContent dividers>
                <Typography gutterBottom>{messageData}</Typography>
              </DialogContent>
              <DialogActions>
                <Button autoFocus onClick={handleClickClose}>
                  Close
                </Button>
              </DialogActions>
            </BootstrapDialog>
            <Snackbar
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'center',
              }}
              open={open}
              autoHideDuration={2000}
              onClose={handleClose}
            >
              <SnackbarContent
                contentprops={{
                  'aria-describedby': 'message-id',
                }}
                // prettier-ignore
                message={(
                  `Thanks for registering with HertzAI`
                )}
              />
            </Snackbar>
            <Snackbar
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'center',
              }}
              open={openError}
              autoHideDuration={2000}
              onClose={handleClose}
            >
              <SnackbarContent
                contentprops={{
                  'aria-describedby': 'message-id',
                }}
                // prettier-ignore
                message={(
                  `Looks like there was a problem, please try again !`
                )}
              />
            </Snackbar>
          </form>
        </Box>
      </Container>
    </React.Fragment>
  );
}
