import Footer from '../components/footer';
import Navbar from '../components/navbar';
import {mailerApi} from '../services/socialApi';
import {logger} from '../utils/logger';

import React, {useEffect, useState} from 'react';
import ReactGA from 'react-ga';
import {AiOutlineClose} from 'react-icons/ai';
import {FiCheckCircle} from 'react-icons/fi';
import {Link, useNavigate, useLocation} from 'react-router-dom';
import {v4 as uuidv4} from 'uuid';


export default function SpeechPricing() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hevolvedroid, setIshevolvedroid] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [numOfStudents, setNumOfStudents] = useState(null);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const {DataForPricePage} = location.state || {};
  const [planId, setPlanId] = useState(6);
  const [planMessage, setPlanMessage] = useState(null);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    setIshevolvedroid(userAgent.includes('speechtherapy'));
    document.documentElement.setAttribute('dir', 'ltr');
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }, []);

  useEffect(() => {
    try {
      const userDetails = window.Handy?.getPlanDetails();
      if (!userDetails) throw new Error('No user details found');
      logger.log('Raw userDetails:', userDetails);
      const userJson = JSON.parse(userDetails);
      logger.log(userJson, 'this is the userJson');

      // Set plan_id and plan_message in separate states
      setPlanId(userJson.plan_ID || null);
      setPlanMessage(userJson.plan_message || null);
    } catch (error) {
      console.error('Error fetching or parsing user details:', error);
    }
  }, []);

  useEffect(() => {
    logger.log('Chatbot Details Updated:', planId, planMessage);
  }, [planId, planMessage]);

  useEffect(() => {
    if (DataForPricePage && DataForPricePage.num_of_students) {
      setNumOfStudents(DataForPricePage.num_of_students);
    }
  }, [DataForPricePage]);

  useEffect(() => {
    const getSubscriptionsByPlans = async () => {
      try {
        // mailerApi auto-unwraps response.data
        const data = await mailerApi.getPlans();
        logger.log('data', data);
        logger.log('chatbotplandetails', planId);
        logger.log('Type of chatbotDetails.plan_id:', typeof planId);
        logger.log(planMessage, 'this is the chatbot details');

        const filteredPlans = data.filter(
          (subscription) => subscription.plan_id === planId
        );
        logger.log(filteredPlans, 'this is the filter');

        if (hevolvedroid) {
          const additionalPlan = data.find(
            (subscription) => subscription.price === 699
          );
          setSubscriptionData(additionalPlan ? [additionalPlan] : []);
        }
        setSubscriptionData(filteredPlans);
      } catch (error) {
        console.error('Error fetching subscriptions:', error.message);
      }
    };

    getSubscriptionsByPlans();
  }, [hevolvedroid, planId, planMessage]);

  const handlePayNowClick = async (subscription) => {
    setSelectedSubscription(subscription);
    const uuid = uuidv4();
    const truncatedUuid = uuid.replace(/-/g, '').substring(0, 36);
    const transactionid = 'T' + truncatedUuid;

    let userData = {};

    // Always fetch user details
    try {
      const userDetails = window.Handy.getUserDetails();
      const userJson = JSON.parse(userDetails);
      userData = userJson;

      // Set transaction ID if the user is from HevolveDroid
      if (hevolvedroid) {
        const myVariable = {TRANSACTION_ID: transactionid};
        const jsTransaction = JSON.stringify(myVariable);
        window.Handy.setTransactionId(jsTransaction);
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
      return; // Early exit if user details cannot be fetched
    }

    const postData = {
      phone_number: userData.phone_number,
      plan_id: subscription.plan_id,
      transaction_id: transactionid,
    };

    // Send subscription data to the first endpoint
    try {
      await mailerApi.addSubscription(postData);
    } catch (error) {
      console.error('Error sending subscription data:', error);
      return; // Early exit if the subscription data fails
    }

    const Total_Amount = userData.num_of_students
      ? subscription?.price * userData.num_of_students
      : subscription?.price;

    const payload = {
      mobile_number: userData.phone_number,
      plan_id: subscription.plan_id,
      transaction_id: transactionid,
      amount: Total_Amount,
    };

    // Send payment data to the second endpoint
    try {
      // mailerApi auto-unwraps response.data
      const redirect = await mailerApi.makePayment(payload);
      window.location.href = redirect;
    } catch (error) {
      console.error('Error during payment process:', error);
    }
  };

  ReactGA.event({
    category: 'Button',
    action: 'Click',
    label: 'Payment Page Click',
  });

  return (
    <>
      {!hevolvedroid && <Navbar />}
      <section style={{paddingTop: '4rem'}} className="relative mt-4">
        <div className="container relative">
          <div className="grid grid-cols-1 text-center">
            <div>
              <h5 className="md:text-4xl text-3xl md:leading-normal leading-normal tracking-wider font-semibold text-white mb-0">
                {planMessage}
              </h5>
            </div>
            <ul className="tracking-[0.5px] mb-0 inline-block">
              <li className="inline-block capitalize text-[15px] font-medium duration-500 ease-in-out text-white/50 hover:text-white">
                <Link to="/">Hevolve AI</Link>
              </li>
              <li className="inline-block text-base text-white/50 mx-0.5">
                <i className="mdi mdi-chevron-right"></i>
              </li>
              <li className="inline-block capitalize text-[15px] font-medium duration-500 ease-in-out text-white">
                Pricing
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="relative md:pb-24 pb-16">
        <div className="container relative">
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
                      per month / For {numOfStudents} User
                    </p>
                    <div className="mt-6">
                      <button
                        onClick={() => handlePayNowClick(subscription)}
                        style={{
                          background:
                            'linear-gradient(to right, #00e89d, #0078ff)',
                          borderColor: '#00f0c5',
                          color: '#FFFAE8',
                          transition: 'background-color 0.3s ease',
                        }}
                        className="py-2 px-5 inline-block font-semibold tracking-wide border align-middle duration-500 text-base text-center bg-amber-400/5 hover:bg-amber-400 rounded border-amber-400/10 hover:border-amber-400 text-amber-400 hover:text-white"
                      >
                        {subscription.price === 0
                          ? 'Register For Free'
                          : 'Pay Now'}
                      </button>
                      <p className="text-slate-400 text-sm mt-3">
                        No credit card required. Free 14-days trial
                      </p>
                    </div>
                  </div>
                  <div className="absolute top-5 right-0 mr-4 mt-4">
                    <FiCheckCircle size={30} color="#00e89d" />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
