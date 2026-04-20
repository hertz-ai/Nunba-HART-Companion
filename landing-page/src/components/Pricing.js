import {mailerApi} from '../services/socialApi';
import {logger} from '../utils/logger';

import React, {useState, useEffect} from 'react';
import ReactGA from 'react-ga';
import {AiOutlineClose} from 'react-icons/ai';
import {FiCheckCircle} from 'react-icons/fi';
import {useNavigate, useLocation} from 'react-router-dom';
import {v4 as uuidv4} from 'uuid';


export default function Pricing() {
  const navigate = useNavigate();
  const location = useLocation();
  const [transactionId, setTransactionId] = useState('');
  const [hevolvedroid, setIshevolvedroid] = useState(true);
  const {DataForPricePage} = location.state || {};

  const [numOfStudents, setNumOfStudents] = useState(null);
  // const [showAlert, setShowAlert] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState(null);

  const [subscriptionData, setSubscriptionData] = useState(null);
  useEffect(() => {
    if (DataForPricePage && DataForPricePage.num_of_students) {
      setNumOfStudents(DataForPricePage.num_of_students);
    }
  }, [DataForPricePage]);
  useEffect(() => {
    const userAgent = navigator.userAgent;
    setIshevolvedroid(userAgent.includes('hevolvedroid'));
  }, []);

  // const hideAlertAfterDelay = () => {
  //     // Hide the alert after 5 seconds (5000 milliseconds)
  //     setTimeout(() => {
  //         setShowAlert(false);
  //     }, 5000);
  // };

  useEffect(() => {
    const getSubscriptionsByPlans = async () => {
      try {
        const data = await mailerApi.getPlans();
        logger.log(data);

        const showHevolveBusiness =
          DataForPricePage &&
          DataForPricePage.num_of_students !== undefined &&
          DataForPricePage.num_of_students !== null &&
          DataForPricePage.num_of_students !== '';

        const filteredData = data.filter((subscription) => {
          // Exclude specific prices
          const excludePrices = [29, 299];
          const shouldExclude = excludePrices.includes(subscription.price);

          if (showHevolveBusiness) {
            return subscription.title === 'Hevolve Business' && !shouldExclude;
          } else {
            return subscription.title !== 'Hevolve Business' && !shouldExclude;
          }
        });

        if (hevolvedroid) {
          setSubscriptionData(
            filteredData.filter(
              (subscription) =>
                subscription.price !== 0 && subscription.title !== 'Free'
            )
          );
        } else {
          setSubscriptionData(filteredData);
        }
      } catch (error) {
        console.error('Error fetching subscriptions:', error.message);
      }
    };

    getSubscriptionsByPlans();
  }, [DataForPricePage, hevolvedroid]);

  const handlePayNowClick = (subscription) => {
    setSelectedSubscription(subscription);
    const uuid = uuidv4();
    const truncatedUuid = uuid.replace(/-/g, '').substring(0, 36);
    const transactionid = 'T' + truncatedUuid;
    setTransactionId(transactionid);
    if (hevolvedroid) {
      try {
        const userDetails = window.Handy.getUserDetails();
        const userJson = JSON.parse(userDetails);
        DataForPricePage = userJson;
      } catch (error) {
        console.error('Error fetching user details:', error);
      }

      const myVariable = {
        TRANSACTION_ID: transactionId,
      };
      const jsTransaction = JSON.stringify(myVariable);
      window.Handy.setTransactionId(jsTransaction);
    }

    const {title, description, price} = subscription;

    const postData = {
      phone_number: DataForPricePage ? DataForPricePage.phone_number : '',
      plan_id: subscription.plan_id,
      transaction_id: transactionid,
    };

    // not for the payment
    mailerApi
      .addSubscription(postData)
      .then(() => {
        // Handle the response, e.g., redirect the user to the payment gateway
        // based on the response from your server
      })
      .catch((error) => {
        console.error('Payment error:', error);
      });

    const payload = {
      mobile_number: DataForPricePage ? DataForPricePage.phone_number : '',
      plan_id: subscription.plan_id,
      transaction_id: transactionid,
      amount: numOfStudents
        ? subscription.price * numOfStudents
        : subscription.price,
    };

    mailerApi
      .makePayment(payload)
      .then((redirect) => {
        window.location.href = redirect;
      })
      .catch((error) => {
        console.error('Error:', error);
      });
    ReactGA.event({
      category: 'Button',
      action: 'Click',
      label: 'Payment Page Click',
    });
  };

  return (
    <>
      {/* {showAlert && (
                    <Alert style={{textAlign:'center'}} severity="error">Please sign up or login first.</Alert>
                )} */}
      <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 mt-6 gap-6">
        {subscriptionData &&
          subscriptionData.map((subscription) => (
            <div
              key={subscription.plan_id}
              style={{backgroundColor: '#1E1E1E'}}
              className="relative overflow-hidden rounded-md shadow dark:shadow-gray-800"
            >
              <div className="p-6">
                <h5 className="text-2xl leading-normal font-semibold">
                  {subscription.title}
                </h5>
                <p className="text-slate-400 mt-2">
                  {subscription.description}
                </p>
                <div className="flex mt-4">
                  <span className="text-lg font-semibold">₹</span>
                  <span className="text-5xl font-semibold mb-0 ms-1">
                    {numOfStudents
                      ? subscription.price * numOfStudents
                      : subscription.price}
                  </span>
                </div>
                <p className="text-slate-400 uppercase text-xs">
                  per month/ For {numOfStudents} User
                </p>

                <div className="mt-6">
                  {subscription.price === 0 ? (
                    <button
                      style={{
                        background:
                          'linear-gradient(to right, #00e89d, #0078ff)',
                        backgroundImage:
                          'linear-gradient(to right, rgb(0, 232, 157), rgb(0, 120, 255))',
                        borderColor: '#00f0c5',
                        color: '#FFFAE8',
                        transition: 'background-color 0.3s ease',
                      }}
                      onClick={() => handlePayNowClick(subscription)}
                      className="py-2 px-5 inline-block font-semibold tracking-wide border align-middle duration-500 text-base text-center bg-amber-400/5 hover:bg-amber-400 rounded border-amber-400/10 hover:border-amber-400 text-amber-400 hover:text-white"
                    >
                      Register For Free
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePayNowClick(subscription)}
                      style={{
                        background:
                          'linear-gradient(to right, #00e89d, #0078ff)',
                        backgroundImage:
                          'linear-gradient(to right, rgb(0, 232, 157), rgb(0, 120, 255))',
                        borderColor: '#00f0c5',
                        color: '#FFFAE8',
                        transition: 'background-color 0.3s ease',
                      }}
                      className="py-2 px-5 inline-block font-semibold tracking-wide border align-middle duration-500 text-base text-center bg-amber-400/5 hover:bg-amber-400 rounded border-amber-400/10 hover:border-amber-400 text-amber-400 hover:text-white"
                    >
                      Pay Now
                    </button>
                  )}
                  <p className="text-slate-400 text-sm mt-3">
                    No credit card required. Free 14-days trial
                  </p>
                </div>
              </div>

              <div className="p-6 bg-gray-50 dark:bg-slate-800">
                <ul className="list-none text-slate-400">
                  <li className="font-semibold text-slate-900 dark:text-white text-sm uppercase">
                    Features:
                  </li>

                  {subscription.features.map((feature, index) => (
                    <li key={index} className="flex items-center mt-2">
                      {feature.access ? (
                        <FiCheckCircle className="text-green-600 h-[18px] w-[18px] me-2" />
                      ) : (
                        <AiOutlineClose className=" text-red-600 h-[18px] w-[18px] me-2" />
                      )}
                      <span
                        className={`text-slate-900 ${feature.access ? 'dark:text-white' : 'dark:text-white'} me-1 font-semibold`}
                      >
                        {feature.name}
                      </span>
                      {feature.daily && (
                        <span className="text-slate-400 me-1 font-semibold">
                          Daily: {feature.daily}
                        </span>
                      )}
                      {feature.monthly && (
                        <span className="text-slate-400 me-1 font-semibold">
                          Monthly: {feature.monthly}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
      </div>
    </>
  );
}
