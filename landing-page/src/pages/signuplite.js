import Footer from '../components/footer';
import NabBarLite from '../components/navbarlite';
import {mailerApi} from '../services/socialApi';
import {logger} from '../utils/logger';

import VerifiedIcon from '@mui/icons-material/Verified';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import SnackbarContent from '@mui/material/SnackbarContent';
import React, {useEffect, useState} from 'react';
import ReactGA from 'react-ga';
import {useNavigate} from 'react-router-dom';
import {Link} from 'react-router-dom';

export default function SignupLite() {
  const navigate = useNavigate();
  const [clientIdState, setClientIdState] = useState(null);
  const [showAlert, setShowAlert] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [userType, SetUserType] = useState('Business');
  const [NumberOfStudent, setNumberofStudent] = useState();
  const [otpSent, setOtpSent] = useState(false); // for otp sent or not
  const [otp, setOtp] = useState();
  const [ErrorMessage, setErrorMessage] = useState();
  const [isOtpSent, setIsOtpSent] = useState();
  const [PhoneNumberVerified, setPhoneNumberVerified] = useState();
  const [open, setOpen] = useState(false);

  useEffect(() => {}, [userType]);

  const radioStyle = {
    backgroundColor: userType === 'Individual' ? 'transparent' : 'transparent',
    border:
      userType === 'Individual' ? '2px solid #ffcc00' : '2px solid #ffcc00',
    borderRadius: '50%',
    height: '20px',
    width: '20px',
    marginRight: '7px',
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    try {
      await mailerApi.sendOtp({phone_number: phoneNumber});
      // mailerApi auto-unwraps; success means OTP sent
      setOtpSent(true);
      setIsOtpSent(true);
    } catch (error) {
      const errorMessage = error?.detail || 'Failed to send OTP';

      const phoneNumberPattern = /(\d{10}) already registered/;
      const match = errorMessage.match(phoneNumberPattern);
      const registeredPhoneNumber = match ? match[1] : '';

      if (registeredPhoneNumber) {
        setErrorMessage('Phone Number is already registered. Please login.');
      } else {
        setErrorMessage(errorMessage);
        console.error('Failed to send OTP:', errorMessage);
      }
      setShowAlert(true);
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleOtpVerification = async (e) => {
    e.preventDefault();
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
      if (result.status === 'verified') {
        setPhoneNumberVerified(true);
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      setErrorMessage('Error verifying OTP');
    }
    ReactGA.event({
      category: 'Button',
      action: 'Click',
      label: 'Signup Button Clicked',
    });
  };
  const DataForPricePage = {
    name: name,
    phone_number: phoneNumber,
    email_address: email,
    dob: dateOfBirth,
    num_of_students: NumberOfStudent,
  };

  const handleFormSubmitBussiness = async (e) => {
    e.preventDefault();

    if (!termsAccepted) {
      // Display an error message or prevent the form submission
      console.error('Terms and conditions must be accepted');
      return;
    }

    // Continue with the form submission logic
    logger.log('Submitting the form with accepted terms...');

    const clientRegObj = {
      name: name,
      phone_number: phoneNumber,
      email_address: email,
      num_of_students: NumberOfStudent,
    };

    try {
      const responseData = await mailerApi.createClient(clientRegObj);
      // mailerApi auto-unwraps response.data
      setClientIdState(responseData.client_id);
      localStorage.setItem('client_id', responseData.client_id);

      navigate('/Plan', {state: {DataForPricePage}});
    } catch (error) {
      console.error('Error:', error);
      setErrorMessage(error?.detail || 'Registration failed');
      setShowAlert(true);
      ReactGA.event({
        category: 'Button',
        action: 'Click',
        label: 'Signup Button Clicked',
      });
    }
  };

  return (
    <>
      <NabBarLite />
      <section
        style={{marginTop: '4.6rem', marginBottom: '2rem'}}
        className="relative overflow-hidden flex items-center justify-center w-full "
      >
        <Snackbar
          open={showAlert}
          autoHideDuration={6000}
          onClose={() => setShowAlert(false)}
          anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        >
          <Alert onClose={() => setShowAlert(false)} severity="error">
            {ErrorMessage}
          </Alert>
        </Snackbar>
        <div className="container relative">
          <div
            style={{backgroundColor: '#1E1E1E !important'}}
            className="md:flex justify-end"
          >
            <div className="lg:w-full md:w-3/4 mx-auto">
              <div
                style={{backgroundColor: 'rgb(30, 30, 30) !important'}}
                className="rounded shadow bg-white dark:bg-slate-900 p-6"
              >
                <h5
                  style={{textAlign: 'center', fontSize: '2.25rem'}}
                  className="mt-6 text-xl font-semibold mb-4"
                >
                  Create Your Institution Account
                </h5>

                <form className="text-start mt-4">
                  <div className="grid grid-cols-1">
                    <div className="mb-4">
                      <label className="font-semibold" htmlFor="RegisterName">
                        Your Name:
                      </label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        id="RegisterName"
                        type="text"
                        className="form-input mt-3 w-full py-2 px-3 h-10 bg-transparent dark:bg-slate-900 dark:text-slate-200 rounded outline-none border border-gray-200 focus:border-amber-400 dark:border-gray-800 dark:focus:border-amber-400 focus:ring-0"
                        placeholder="User Name"
                      />
                    </div>

                    <div className="mb-4">
                      <label className="font-semibold" htmlFor="LoginEmail">
                        Email Address:
                      </label>
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        id="LoginEmail"
                        type="email"
                        className="form-input mt-3 w-full py-2 px-3 h-10 bg-transparent dark:bg-slate-900 dark:text-slate-200 rounded outline-none border border-gray-200 focus:border-amber-400 dark:border-gray-800 dark:focus:border-amber-400 focus:ring-0"
                        placeholder="username@example.com"
                      />
                    </div>

                    <div className="mb-4">
                      <label className="font-semibold" htmlFor="LoginPassword">
                        Phone Number:
                      </label>
                      <div
                        className="flex"
                        style={{
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <input
                          disabled={PhoneNumberVerified}
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          id="LoginPassword"
                          type="tel"
                          className={`form-input mt-3 ${phoneNumber.length === 10 ? 'w-4/5' : 'w-full'} py-2 px-3 h-10 bg-transparent dark:bg-slate-900 dark:text-slate-200 rounded outline-none border border-gray-200 focus:border-amber-400 dark:border-gray-800 dark:focus:border-amber-400 focus:ring-0`}
                          placeholder="Phone Number:"
                        />
                        {PhoneNumberVerified && (
                          <VerifiedIcon
                            style={{color: 'green', marginLeft: '8px'}}
                          />
                        )}

                        {phoneNumber.length === 10 && !PhoneNumberVerified && (
                          <>
                            <button
                              className="py-[6px] px-4 md:inline hidden items-center justify-center tracking-wider align-middle duration-500 text-sm text-center rounded"
                              style={{
                                background:
                                  'linear-gradient(to right, #00e89d, #0078ff)',
                                backgroundImage:
                                  'linear-gradient(to right, rgb(0, 232, 157), rgb(0, 120, 255))',
                                borderColor: '#00f0c5',
                                color: '#FFFAE8',
                                transition: 'background-color 0.3s ease',
                                width: '80px !important',
                                height: '40px !important',
                              }}
                              onClick={handleSendOtp}
                            >
                              {otpSent ? 'Resend OTP' : 'Send OTP'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isOtpSent && !PhoneNumberVerified && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-around',
                          alignItems: 'center',
                          textAlign: 'center',
                        }}
                        className="mb-4"
                      >
                        <label className="font-semibold" htmlFor="OtpInput">
                          Enter OTP:
                        </label>
                        <input
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          id="OtpInput"
                          type="text"
                          className="form-input flex-grow mt-3 w-3/4 py-2 px-3 h-10 bg-transparent dark:bg-slate-900 dark:text-slate-200 rounded outline-none border border-gray-200 focus:border-amber-400 dark:border-gray-800 dark:focus:border-amber-400 focus:ring-0"
                          placeholder="Enter OTP"
                        />
                        <button
                          type="button"
                          className="py-[6px] px-4 md:inline hidden items-center justify-center tracking-wider align-middle duration-500 text-sm text-center rounded"
                          style={{
                            background:
                              'linear-gradient(to right, #00e89d, #0078ff)',
                            backgroundImage:
                              'linear-gradient(to right, rgb(0, 232, 157), rgb(0, 120, 255))',
                            borderColor: '#00f0c5',
                            color: '#FFFAE8',
                            cursor: 'pointer',
                            transition: 'background-color 0.3s ease',
                            width: '80px !important',
                            height: '40px !important',
                          }}
                          onClick={handleOtpVerification}
                        >
                          Verify
                        </button>
                      </div>
                    )}
                    <div className="mb-4">
                      <label className="font-semibold" htmlFor="LoginPassword">
                        Date of Birth
                      </label>
                      <input
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        id="LoginPassword"
                        type="date"
                        className="form-input mt-3 w-full py-2 px-3 h-10 bg-transparent dark:bg-slate-900 dark:text-slate-200 rounded outline-none border border-gray-200 focus:border-amber-400 dark:border-gray-800 dark:focus:border-amber-400 focus:ring-0"
                        placeholder="Date of Birth:"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="font-semibold" htmlFor="LoginPassword">
                        Number of Agent Users
                      </label>
                      <input
                        value={NumberOfStudent}
                        onChange={(e) => setNumberofStudent(e.target.value)}
                        id="LoginPassword"
                        type="number"
                        className="form-input mt-3 w-full py-2 px-3 h-10 bg-transparent dark:bg-slate-900 dark:text-slate-200 rounded outline-none border border-gray-200 focus:border-amber-400 dark:border-gray-800 dark:focus:border-amber-400 focus:ring-0"
                        placeholder="Number of Agent Users :"
                      />
                    </div>

                    <div className="mb-4">
                      <div className="flex items-center w-full mb-0">
                        <input
                          style={{radioStyle}}
                          className="form-checkbox rounded  focus:border-amber-300 focus:ring focus:ring-offset-0 focus:ring-amber-200 focus:ring-opacity-50 me-2 cursor-pointer"
                          type="checkbox"
                          value={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.value)}
                          id="AcceptT&C"
                        />
                        <label
                          className="form-check-label text-slate-400 cursor-pointer"
                          htmlFor="AcceptT&C"
                        >
                          I Accept{' '}
                          <Link to="" className="text-amber-400">
                            Terms And Condition
                          </Link>
                        </label>
                      </div>
                    </div>

                    <div className="mb-4">
                      <button
                        disabled={!PhoneNumberVerified && !termsAccepted}
                        type="submit"
                        className="py-2 px-5 inline-block tracking-wide border align-middle duration-500 text-base text-center bg-amber-400 hover:bg-amber-500 border-amber-400 hover:border-amberbg-amber-500 text-white rounded-md w-full"
                        onClick={handleFormSubmitBussiness}
                        style={{
                          background:
                            'linear-gradient(to right, #00e89d, #0078ff)',
                          backgroundImage:
                            'linear-gradient(to right, rgb(0, 232, 157), rgb(0, 120, 255))',
                          borderColor: '#00f0c5',
                          color: '#FFFAE8',
                          cursor: 'pointer',
                          transition: 'background-color 0.3s ease',
                          width: '80px !important',
                          height: '40px !important',
                        }}
                      >
                        Register
                      </button>
                    </div>
                    <Snackbar
                      anchorOrigin={{
                        vertical: 'center',
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
                                                    `Thanks for registering with HEVOLVE AI`
                                                )}
                      />
                    </Snackbar>
                    <div className="text-center">
                      <span className="text-slate-400 me-2">
                        Already have an account?
                      </span>
                      <a
                        href="https://hevolvechat.hertzai.com/teacher/signin"
                        className="text-slate-900 dark:text-white font-bold inline-block"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Sign in
                      </a>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
