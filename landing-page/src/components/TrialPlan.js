import {mailerApi} from '../services/socialApi';

import React, {useState, useEffect} from 'react';
import ReactGA from 'react-ga';
import {AiOutlineClose} from 'react-icons/ai';
import {FiCheckCircle} from 'react-icons/fi';
import {useNavigate, useLocation} from 'react-router-dom';
import {Swiper as SwiperComponent, SwiperSlide} from 'swiper/react';
import {v4 as uuidv4} from 'uuid';
import 'swiper/css';

export default function TrialPlan() {
  const navigate = useNavigate();
  const location = useLocation();
  const [transactionId, setTransactionId] = useState('');
  const [hevolvedroid, setIshevolvedroid] = useState(false); // Default to false
  const [TrialPlan, setTrialPlan] = useState([]);
  const {DataForPricePage} = location.state || {};
  const [numOfStudents, setNumOfStudents] = useState(null);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [subscriptionData, setSubscriptionData] = useState([]);
  const [activeSlide, setActiveSlide] = useState(0);
  useEffect(() => {
    if (DataForPricePage && DataForPricePage.num_of_students) {
      setNumOfStudents(DataForPricePage.num_of_students);
    }
  }, [DataForPricePage]);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    setIshevolvedroid(userAgent.includes('hevolvedroid'));
  }, []);

  useEffect(() => {
    const getSubscriptionsByPlans = async () => {
      try {
        // mailerApi auto-unwraps response.data
        const data = await mailerApi.getPlans();

        const showHevolveBusiness =
          DataForPricePage &&
          DataForPricePage.num_of_students !== undefined &&
          DataForPricePage.num_of_students !== null &&
          DataForPricePage.num_of_students !== '';
        const filteredData = data.filter((subscription) => {
          if (showHevolveBusiness) {
            return subscription.title === 'Hevolve Business';
          } else {
            return subscription.title !== 'Hevolve Business';
          }
        });

        // Exclude subscriptions with prices of 0 or 29
        const relevantSubscriptions = filteredData.filter(
          (subscription) =>
            subscription.price !== 0 && subscription.price !== 29
        );
        const TrialPlan = filteredData.filter(
          (subscription) => subscription.price === 29
        );

        setSubscriptionData(relevantSubscriptions);
        setTrialPlan(TrialPlan);
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

    const postData = {
      phone_number: DataForPricePage ? DataForPricePage.phone_number : '',
      plan_id: subscription.plan_id,
      transaction_id: transactionid,
    };

    mailerApi.addSubscription(postData).catch((error) => {
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

    // mailerApi auto-unwraps response.data
    mailerApi
      .makePayment(payload)
      .then((data) => {
        const redirect = data;
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
    <div>
      {hevolvedroid ? (
        <div>
          <SwiperComponent
            spaceBetween={20}
            slidesPerView={1}
            pagination={{clickable: true}}
            navigation
            className="mySwiper"
          >
            {TrialPlan.length > 0 &&
              TrialPlan.map((subscription) => (
                <SwiperSlide
                  key={subscription.plan_id}
                  className={`relative overflow-hidden rounded-md shadow dark:shadow-gray-800 
                                p-6 transition-transform duration-500 
                                ${TrialPlan.indexOf(subscription) === 0 ? 'scale-110' : 'scale-90'} 
                                ${TrialPlan.indexOf(subscription) === 0 ? 'bg-white dark:bg-gray-700' : 'bg-gray-200 dark:bg-gray-800'}`}
                >
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
                        aria-label="Register For Free"
                        style={{
                          background:
                            'linear-gradient(to right, #00e89d, #0078ff)',
                          borderColor: '#00f0c5',
                          color: '#FFFAE8',
                        }}
                        onClick={() => handlePayNowClick(subscription)}
                        className="py-2 px-5 inline-block font-semibold tracking-wide border rounded text-amber-400 hover:text-white"
                      >
                        Register For Free
                      </button>
                    ) : (
                      <button
                        aria-label="Pay Now"
                        onClick={() => handlePayNowClick(subscription)}
                        style={{
                          background:
                            'linear-gradient(to right, #00e89d, #0078ff)',
                          borderColor: '#00f0c5',
                          color: '#FFFAE8',
                        }}
                        className="py-2 px-5 inline-block font-semibold tracking-wide border rounded text-amber-400 hover:text-white"
                      >
                        Pay Now
                      </button>
                    )}
                    <p className="text-slate-400 text-sm mt-3">
                      No credit card required. Free 14-days trial
                    </p>
                  </div>
                  <div className="p-6 bg-gray-50 dark:bg-slate-800">
                    <ul className="list-none text-slate-400">
                      <li className="font-semibold text-slate-900 dark:text-white text-sm uppercase">
                        Features:
                      </li>
                      {subscription.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center mt-2">
                          {feature.access ? (
                            <FiCheckCircle className="text-green-600 h-[18px] w-[18px] me-2" />
                          ) : (
                            <AiOutlineClose className="text-red-600 h-[18px] w-[18px] me-2" />
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
                </SwiperSlide>
              ))}
          </SwiperComponent>
        </div>
      ) : (
        <div>
          <SwiperComponent
            spaceBetween={20}
            slidesPerView={2.1}
            pagination={{clickable: true}}
            navigation
            className="mySwiper"
            onSlideChange={(swiper) => setActiveSlide(swiper.activeIndex)}
          >
            {subscriptionData.length > 0 &&
              subscriptionData.map((subscription, index) => (
                <SwiperSlide
                  key={subscription.plan_id}
                  className={`relative overflow-hidden rounded-md shadow dark:shadow-gray-800 
                                    p-6 transition-transform duration-300 
                                    ${index === activeSlide ? 'scale-100' : 'scale-90'} 
                                    ${index === activeSlide ? 'bg-white dark:bg-gray-700' : 'bg-gray-200 dark:bg-gray-800'}`}
                >
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
                        aria-label="Register For Free"
                        style={{
                          background:
                            'linear-gradient(to right, #00e89d, #0078ff)',
                          borderColor: '#00f0c5',
                          color: '#FFFAE8',
                        }}
                        onClick={() => handlePayNowClick(subscription)}
                        className="py-2 px-5 inline-block font-semibold tracking-wide border rounded text-amber-400 hover:text-white"
                      >
                        Register For Free
                      </button>
                    ) : (
                      <button
                        aria-label="Pay Now"
                        onClick={() => handlePayNowClick(subscription)}
                        style={{
                          background:
                            'linear-gradient(to right, #00e89d, #0078ff)',
                          borderColor: '#00f0c5',
                          color: '#FFFAE8',
                        }}
                        className="py-2 px-5 inline-block font-semibold tracking-wide border rounded text-amber-400 hover:text-white"
                      >
                        Pay Now
                      </button>
                    )}
                    <p className="text-slate-400 text-sm mt-3">
                      No credit card required. Free 14-days trial
                    </p>
                  </div>
                  <div className="p-6 bg-gray-50 dark:bg-slate-800">
                    <ul className="list-none text-slate-400">
                      <li className="font-semibold text-slate-900 dark:text-white text-sm uppercase">
                        Features:
                      </li>
                      {subscription.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center mt-2">
                          {feature.access ? (
                            <FiCheckCircle className="text-green-600 h-[18px] w-[18px] me-2" />
                          ) : (
                            <AiOutlineClose className="text-red-600 h-[18px] w-[18px] me-2" />
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
                </SwiperSlide>
              ))}
          </SwiperComponent>
        </div>
      )}
    </div>
  );
}
