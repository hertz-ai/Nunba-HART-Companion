import OTPModal from './OTPModal';

import {mailerApi} from '../services/socialApi';
import {encrypt} from '../utils/encryption';

import Alert from '@mui/material/Alert';
import {getCountries, getCountryCallingCode} from 'libphonenumber-js';
import {ChevronDown} from 'lucide-react';
import React, {useEffect, useState, useRef} from 'react';
import ReactGA from 'react-ga';
import {Link} from 'react-router-dom';
import {useNavigate} from 'react-router-dom';




const PhoneNumberInput = ({
  phoneNumber,
  setPhoneNumber,
  countryCode,
  setCountryCode,
  isDropdownOpen,
  setIsDropdownOpen,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [countries, setCountries] = useState([]);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const allCountries = getCountries().map((country) => ({
      code: `+${getCountryCallingCode(country)}`,
      country: `${new Intl.DisplayNames(['en'], {type: 'region'}).of(country)} (${country})`,
      searchName:
        `${new Intl.DisplayNames(['en'], {type: 'region'}).of(country)}`.toLowerCase(),
    }));

    allCountries.sort((a, b) => a.country.localeCompare(b.country));
    setCountries(allCountries);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsDropdownOpen]);

  const filteredCountries = countries.filter(
    (country) =>
      country.searchName.includes(searchQuery.toLowerCase()) ||
      country.code.includes(searchQuery) ||
      country.country.toLowerCase().includes(searchQuery.toLowerCase())
  );
  useEffect(() => {}, [searchQuery, countries]);

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
  };

  return (
    <div className="mb-4">
      <label className="font-semibold" htmlFor="phoneNumber">
        Phone Number:
      </label>
      <div className="flex gap-2">
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            className="form-input mt-3 flex items-center justify-between w-28 py-2 px-3 h-10 bg-transparent dark:bg-slate-900 dark:text-slate-200 rounded outline-none border border-gray-200 focus:border-amber-400 dark:border-gray-800"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            {countryCode}
            <ChevronDown size={16} />
          </button>

          {isDropdownOpen && (
            <div className="absolute z-50 mt-1 w-64 bg-white dark:bg-slate-900 border rounded-md shadow-lg">
              <div className="p-2 border-b">
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md dark:bg-slate-800 dark:text-slate-200"
                  placeholder="Search countries..."
                  value={searchQuery}
                  onChange={handleSearch}
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredCountries.length > 0 ? (
                  filteredCountries.map((country, index) => (
                    <button
                      key={index}
                      className="block w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-slate-800 dark:text-slate-200"
                      onClick={() => {
                        setCountryCode(country.code);
                        setIsDropdownOpen(false);
                        setSearchQuery('');
                      }}
                    >
                      {`${country.country} ${country.code}`}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-2 text-gray-500 dark:text-gray-400">
                    No countries found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <input
          id="phoneNumber"
          type="tel"
          value={phoneNumber}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, '').slice(0, 10);
            setPhoneNumber(value);
          }}
          className="form-input mt-3 flex-1 py-2 px-3 h-10 bg-white dark:bg-slate-900 dark:text-slate-200 rounded outline-none border border-gray-200 focus:border-amber-400 dark:border-gray-800 dark:focus:border-amber-400 focus:ring-0"
          placeholder="Enter your phone number"
        />
      </div>
    </div>
  );
};

export default function NewSignUp() {
  const navigate = useNavigate();
  const [clientIdState, setClientIdState] = useState(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [userType, SetUserType] = useState('Business');
  const [NumberOfStudent, setNumberofStudent] = useState();
  const [otp, setOtp] = useState('');
  const [ErrorMessage, setErrorMessage] = useState();
  const [showAlert, setShowAlert] = useState(false);

  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [countryCode, setCountryCode] = useState('+91');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [expireTime, setExpireTime] = useState(20);
  const [startTime, setStartTime] = useState(null);
  const [intervalId, setIntervalId] = useState(null);

  useEffect(() => {}, [userType]);

  const handleRadioChange = (selectedType) => {
    SetUserType(selectedType);
  };

  const encryptData = (data) => {
    return encrypt(data);
  };

  const handleOtpVerification = async (e) => {
    e.preventDefault();
    if (!otp) {
      setErrorMessage('Please enter the OTP');
      setShowAlert(true);
      return;
    }

    try {
      // mailerApi auto-unwraps response.data
      const result = await mailerApi.verifyOtp({
        phone_number: `${countryCode}${phoneNumber}`,
        otp: otp,
      });

      const expireTokenTime = result.expires_in;
      setExpireTime(expireTokenTime);

      if (result?.access_token) {
        const encryptedUserId = encryptData(String(result.user_id));
        const encryptedUserEmail = encryptData(result.email_address);
        localStorage.setItem('access_token', result.access_token);
        localStorage.setItem('user_id', encryptedUserId);
        localStorage.setItem('email_address', encryptedUserEmail);

        setIsOtpModalOpen(false);

        navigate('/agents/Hevolve');
        const startLoginTime = Date.now();
        setStartTime(startLoginTime);

        const interval = setInterval(() => {
          const remainingTime =
            expireTokenTime * 1000 - (Date.now() - startLoginTime);

          if (remainingTime <= 5000) {
            renewToken(result.user_id);
            clearInterval(interval);
          }
        }, 1000);

        setIntervalId(interval);
      } else {
        setErrorMessage('Invalid OTP. Please try again.');
        setShowAlert(true);
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      setErrorMessage('Error verifying OTP. Please try again.');
      setShowAlert(true);
    }
  };

  const renewToken = async (userId) => {
    try {
      const result = await mailerApi.renewToken({user_id: userId});
      // mailerApi auto-unwraps; result is the response body
      const newAccessToken = String(result.access_token);
      localStorage.setItem('expire_token', newAccessToken);
    } catch (renewError) {
      console.error('Error renewing token', renewError);
    }
  };

  useEffect(() => {
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [intervalId]);

  const DataForPricePage = {
    name: name,
    phone_number: phoneNumber,
    email_address: email,
    dob: dateOfBirth,
    num_of_students: NumberOfStudent,
  };

  const validateForm = () => {
    if (!name.trim()) {
      setErrorMessage('User name is required.');
      return false;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setErrorMessage('Please enter a valid email address.');
      return false;
    }

    const phonePattern = /^[0-9]{10}$/;
    if (!phonePattern.test(phoneNumber)) {
      setErrorMessage('Please enter a valid 10-digit phone number.');
      return false;
    }

    if (!dateOfBirth) {
      setErrorMessage('Date of birth is required.');
      return false;
    }

    if (!termsAccepted) {
      setErrorMessage('Terms and conditions must be accepted.');
      return false;
    }

    return true;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      setShowAlert(true);
      return;
    }

    const forStudent = {
      name,
      phone_number: `${countryCode}${phoneNumber}`,
      email_address: email,
      dob: dateOfBirth,
    };

    try {
      const responseData = await mailerApi.registerStudent(forStudent);
      // mailerApi auto-unwraps response.data
      if (responseData.response === 'success') {
        setIsOtpModalOpen(true);
      } else {
        setErrorMessage(
          responseData.detail || 'Failed to register. Please try again.'
        );
        setShowAlert(true);
      }
    } catch (error) {
      console.error('Error:', error);
      setErrorMessage(
        error?.detail ||
          error?.message ||
          'Something went wrong. Please try again.'
      );
      setShowAlert(true);
    }
  };

  const handleFormSubmitBussiness = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      setShowAlert(true);
      return;
    }

    const clientRegObj = {
      name: name,
      phone_number: `${countryCode}${phoneNumber}`,
      email_address: email,
      num_of_students: NumberOfStudent,
    };

    try {
      const responseData = await mailerApi.createClient(clientRegObj);
      // mailerApi auto-unwraps response.data

      if (
        responseData?.detail?.includes(
          'User already registered with same email'
        )
      ) {
        setShowAlert(true);
        setErrorMessage(responseData.detail);
      } else {
        setClientIdState(responseData.client_id);
        setIsOtpModalOpen(true);
      }
    } catch (error) {
      console.error('Error:', error);
      setShowAlert(true);
      setErrorMessage(error?.detail || 'Post request failed');
      ReactGA.event({
        category: 'Button',
        action: 'Click',
        label: 'Signup Button Clicked',
      });
    }
  };

  const buttonStyles = {
    backgroundColor: '#00f0c5',
    borderColor: '#FFFAE8',
    transition: 'background-color 0.3s ease',
  };

  const buttonHoverStyles = {
    backgroundColor: '#0197f7',
  };

  return (
    <>
      <section
        style={{marginTop: '4rem', marginBottom: '8px'}}
        className="relative overflow-hidden flex items-center justify-center w-full "
      >
        <div className="container relative">
          <div
            style={{backgroundColor: '#1E1E1E !important'}}
            className="md:flex justify-end"
          >
            <div className="lg:w-full md:w-3/4 mx-auto">
              {showAlert && (
                <Alert
                  style={{textAlign: 'center', color: 'black'}}
                  severity="error"
                >
                  {ErrorMessage}
                </Alert>
              )}
              <div
                style={{backgroundColor: 'rgb(30, 30, 30) !important'}}
                className="rounded shadow bg-white dark:bg-slate-900 p-6"
              >
                <h5
                  style={{textAlign: 'center', fontSize: '2.25rem'}}
                  className="mt-6 text-xl font-semibold mb-4"
                >
                  Create an account
                </h5>
                <div
                  style={{flexDirection: 'column'}}
                  className="mb-4 flex flex-col"
                >
                  <label
                    style={{
                      marginTop: '8px',
                      display: 'flex',
                      justifyContent: 'flex-start',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                    className="font-semibold "
                  >
                    Select Account Type:
                  </label>

                  <div
                    style={{
                      flexDirection: 'column',
                      justifyContent: 'flex-start',
                    }}
                    className="flex items-start"
                  >
                    <div className="flex items-center mb-2 mr-4">
                      <input
                        type="radio"
                        value="Individual"
                        checked={userType === 'Individual'}
                        onChange={() => handleRadioChange('Individual')}
                        className="form-radio h-5 w-5 r border-gray-300 rounded-full"
                      />
                      <label style={{marginLeft: '7px'}}>
                        Individual User (Agent User)
                      </label>
                    </div>

                    <div className="flex items-center mb-2">
                      <input
                        type="radio"
                        value="Business"
                        checked={userType === 'Business'}
                        onChange={() => handleRadioChange('Business')}
                        className="form-radio h-5 w-5 border-gray-300 rounded-full"
                      />
                      <label style={{marginLeft: '7px'}}>
                        Business User (AI Agent Creator or Working
                        Professional){' '}
                      </label>
                    </div>
                  </div>
                </div>

                {userType === 'Individual' ? (
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
                        <PhoneNumberInput
                          phoneNumber={phoneNumber}
                          setPhoneNumber={setPhoneNumber}
                          countryCode={countryCode}
                          setCountryCode={setCountryCode}
                          isDropdownOpen={isDropdownOpen}
                          setIsDropdownOpen={setIsDropdownOpen}
                        />
                      </div>
                      <div className="mb-4">
                        <label
                          className="font-semibold"
                          htmlFor="LoginPassword"
                        >
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
                        <div className="flex items-center w-full mb-0">
                          <input
                            className="form-checkbox rounded  focus:border-purple-300 focus:ring focus:ring-offset-0 focus:ring-amber-200 focus:ring-opacity-50 me-2 cursor-pointer"
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
                          type="submit"
                          className="py-2 px-5 inline-block tracking-wide border align-middle duration-500 text-base text-center  text-white rounded-md w-full"
                          style={{
                            backgroundColor: '#00f0c5',
                            borderColor: '#FFFAE8',
                            transition: 'background-color 0.3s ease',
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor =
                              buttonHoverStyles.backgroundColor;
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor =
                              buttonStyles.backgroundColor;
                          }}
                          onClick={handleFormSubmit}
                        >
                          Register
                        </button>
                      </div>

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
                ) : (
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
                        <PhoneNumberInput
                          phoneNumber={phoneNumber}
                          setPhoneNumber={setPhoneNumber}
                          countryCode={countryCode}
                          setCountryCode={setCountryCode}
                          isDropdownOpen={isDropdownOpen}
                          setIsDropdownOpen={setIsDropdownOpen}
                        />
                      </div>

                      <div className="mb-4">
                        <label
                          className="font-semibold"
                          htmlFor="LoginPassword"
                        >
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
                        <label
                          className="font-semibold"
                          htmlFor="LoginPassword"
                        >
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
                          disabled={!termsAccepted}
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
                )}
                <OTPModal
                  isOpen={isOtpModalOpen}
                  onClose={() => setIsOtpModalOpen(false)}
                  otp={otp}
                  setOtp={setOtp}
                  onVerify={handleOtpVerification}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
