/**
 * The upazilas of each district — and, in the twelve districts with one, the
 * city corporation, since most of a city's pharmacies are in no upazila.
 * Keyed by the official district name in districts.ts; each entry is
 * [English, Bangla]. English is what is stored.
 *
 * From the government's upazila portals as gathered by
 * github.com/nuhil/bangladesh-geocode (494 upazilas), with old district
 * spellings in names brought up to date. Copied word for word into
 * packages/shared/src/lib/upazilas.ts; a test keeps the two the same.
 */
// ---- the list ----
export const UPAZILAS: Record<string, [string, string][]> = {
  "Barguna": [["Amtali", "আমতলী"], ["Bamna", "বামনা"], ["Barguna Sadar", "বরগুনা সদর"], ["Betagi", "বেতাগী"], ["Pathorghata", "পাথরঘাটা"], ["Taltali", "তালতলি"]],
  "Barishal": [["Barishal City", "বরিশাল সিটি"], ["Agailjhara", "আগৈলঝাড়া"], ["Babuganj", "বাবুগঞ্জ"], ["Bakerganj", "বাকেরগঞ্জ"], ["Banaripara", "বানারীপাড়া"], ["Barishal Sadar", "বরিশাল সদর"], ["Gournadi", "গৌরনদী"], ["Hizla", "হিজলা"], ["Mehendiganj", "মেহেন্দিগঞ্জ"], ["Muladi", "মুলাদী"], ["Wazirpur", "উজিরপুর"]],
  "Bhola": [["Bhola Sadar", "ভোলা সদর"], ["Borhan Sddin", "বোরহান উদ্দিন"], ["Charfesson", "চরফ্যাশন"], ["Doulatkhan", "দৌলতখান"], ["Lalmohan", "লালমোহন"], ["Monpura", "মনপুরা"], ["Tazumuddin", "তজুমদ্দিন"]],
  "Jhalokati": [["Jhalakathi Sadar", "ঝালকাঠি সদর"], ["Kathalia", "কাঠালিয়া"], ["Nalchity", "নলছিটি"], ["Rajapur", "রাজাপুর"]],
  "Patuakhali": [["Bauphal", "বাউফল"], ["Dashmina", "দশমিনা"], ["Dumki", "দুমকি"], ["Galachipa", "গলাচিপা"], ["Kalapara", "কলাপাড়া"], ["Mirzaganj", "মির্জাগঞ্জ"], ["Patuakhali Sadar", "পটুয়াখালী সদর"], ["Rangabali", "রাঙ্গাবালী"]],
  "Pirojpur": [["Bhandaria", "ভান্ডারিয়া"], ["Kawkhali", "কাউখালী"], ["Mathbaria", "মঠবাড়ীয়া"], ["Nazirpur", "নাজিরপুর"], ["Nesarabad", "নেছারাবাদ"], ["Pirojpur Sadar", "পিরোজপুর সদর"], ["Zianagar", "জিয়ানগর"]],
  "Bandarban": [["Alikadam", "আলীকদম"], ["Bandarban Sadar", "বান্দরবান সদর"], ["Lama", "লামা"], ["Naikhongchhari", "নাইক্ষ্যংছড়ি"], ["Rowangchhari", "রোয়াংছড়ি"], ["Ruma", "রুমা"], ["Thanchi", "থানচি"]],
  "Brahmanbaria": [["Akhaura", "আখাউড়া"], ["Ashuganj", "আশুগঞ্জ"], ["Bancharampur", "বাঞ্ছারামপুর"], ["Bijoynagar", "বিজয়নগর"], ["Brahmanbaria Sadar", "ব্রাহ্মণবাড়িয়া সদর"], ["Kasba", "কসবা"], ["Nabinagar", "নবীনগর"], ["Nasirnagar", "নাসিরনগর"], ["Sarail", "সরাইল"]],
  "Chandpur": [["Chandpur Sadar", "চাঁদপুর সদর"], ["Faridgonj", "ফরিদগঞ্জ"], ["Haimchar", "হাইমচর"], ["Hajiganj", "হাজীগঞ্জ"], ["Kachua", "কচুয়া"], ["Matlab North", "মতলব উত্তর"], ["Matlab South", "মতলব দক্ষিণ"], ["Shahrasti", "শাহরাস্তি"]],
  "Chattogram": [["Chattogram City", "চট্টগ্রাম সিটি"], ["Anwara", "আনোয়ারা"], ["Banshkhali", "বাঁশখালী"], ["Boalkhali", "বোয়ালখালী"], ["Chandanaish", "চন্দনাইশ"], ["Fatikchhari", "ফটিকছড়ি"], ["Hathazari", "হাটহাজারী"], ["Karnafuli", "কর্ণফুলী"], ["Lohagara", "লোহাগাড়া"], ["Mirsharai", "মীরসরাই"], ["Patiya", "পটিয়া"], ["Rangunia", "রাঙ্গুনিয়া"], ["Raozan", "রাউজান"], ["Sandwip", "সন্দ্বীপ"], ["Satkania", "সাতকানিয়া"], ["Sitakunda", "সীতাকুন্ড"]],
  "Cox's Bazar": [["Chakaria", "চকরিয়া"], ["Coxsbazar Sadar", "কক্সবাজার সদর"], ["Eidgaon", "ঈদগাঁও"], ["Kutubdia", "কুতুবদিয়া"], ["Moheshkhali", "মহেশখালী"], ["Pekua", "পেকুয়া"], ["Ramu", "রামু"], ["Teknaf", "টেকনাফ"], ["Ukhiya", "উখিয়া"]],
  "Cumilla": [["Cumilla City", "কুমিল্লা সিটি"], ["Barura", "বরুড়া"], ["Brahmanpara", "ব্রাহ্মণপাড়া"], ["Burichang", "বুড়িচং"], ["Chandina", "চান্দিনা"], ["Chauddagram", "চৌদ্দগ্রাম"], ["Cumilla Sadar", "কুমিল্লা সদর"], ["Daudkandi", "দাউদকান্দি"], ["Debidwar", "দেবিদ্বার"], ["Homna", "হোমনা"], ["Laksam", "লাকসাম"], ["Lalmai", "লালমাই"], ["Meghna", "মেঘনা"], ["Monohargonj", "মনোহরগঞ্জ"], ["Muradnagar", "মুরাদনগর"], ["Nangalkot", "নাঙ্গলকোট"], ["Sadarsouth", "সদর দক্ষিণ"], ["Titas", "তিতাস"]],
  "Feni": [["Chhagalnaiya", "ছাগলনাইয়া"], ["Daganbhuiyan", "দাগনভূঞা"], ["Feni Sadar", "ফেনী সদর"], ["Fulgazi", "ফুলগাজী"], ["Parshuram", "পরশুরাম"], ["Sonagazi", "সোনাগাজী"]],
  "Khagrachhari": [["Dighinala", "দিঘীনালা"], ["Guimara", "গুইমারা"], ["Khagrachhari Sadar", "খাগড়াছড়ি সদর"], ["Laxmichhari", "লক্ষীছড়ি"], ["Manikchari", "মানিকছড়ি"], ["Matiranga", "মাটিরাঙ্গা"], ["Mohalchari", "মহালছড়ি"], ["Panchari", "পানছড়ি"], ["Ramgarh", "রামগড়"]],
  "Lakshmipur": [["Kamalnagar", "কমলনগর"], ["Lakshmipur Sadar", "লক্ষ্মীপুর সদর"], ["Raipur", "রায়পুর"], ["Ramganj", "রামগঞ্জ"], ["Ramgati", "রামগতি"]],
  "Noakhali": [["Begumganj", "বেগমগঞ্জ"], ["Chatkhil", "চাটখিল"], ["Companiganj", "কোম্পানীগঞ্জ"], ["Hatia", "হাতিয়া"], ["Kabirhat", "কবিরহাট"], ["Noakhali Sadar", "নোয়াখালী সদর"], ["Senbug", "সেনবাগ"], ["Sonaimori", "সোনাইমুড়ী"], ["Subarnachar", "সুবর্ণচর"]],
  "Rangamati": [["Baghaichari", "বাঘাইছড়ি"], ["Barkal", "বরকল"], ["Belaichari", "বিলাইছড়ি"], ["Juraichari", "জুরাছড়ি"], ["Kaptai", "কাপ্তাই"], ["Kawkhali", "কাউখালী"], ["Langadu", "লংগদু"], ["Naniarchar", "নানিয়ারচর"], ["Rajasthali", "রাজস্থলী"], ["Rangamati Sadar", "রাঙ্গামাটি সদর"]],
  "Dhaka": [["Dhaka North City", "ঢাকা উত্তর সিটি"], ["Dhaka South City", "ঢাকা দক্ষিণ সিটি"], ["Dhamrai", "ধামরাই"], ["Dohar", "দোহার"], ["Keraniganj", "কেরাণীগঞ্জ"], ["Nawabganj", "নবাবগঞ্জ"], ["Savar", "সাভার"]],
  "Faridpur": [["Alfadanga", "আলফাডাঙ্গা"], ["Bhanga", "ভাঙ্গা"], ["Boalmari", "বোয়ালমারী"], ["Charbhadrasan", "চরভদ্রাসন"], ["Faridpur Sadar", "ফরিদপুর সদর"], ["Madhukhali", "মধুখালী"], ["Nagarkanda", "নগরকান্দা"], ["Sadarpur", "সদরপুর"], ["Saltha", "সালথা"]],
  "Gazipur": [["Gazipur City", "গাজীপুর সিটি"], ["Gazipur Sadar", "গাজীপুর সদর"], ["Kaliakair", "কালিয়াকৈর"], ["Kaliganj", "কালীগঞ্জ"], ["Kapasia", "কাপাসিয়া"], ["Sreepur", "শ্রীপুর"]],
  "Gopalganj": [["Gopalganj Sadar", "গোপালগঞ্জ সদর"], ["Kashiani", "কাশিয়ানী"], ["Kotalipara", "কোটালীপাড়া"], ["Muksudpur", "মুকসুদপুর"], ["Tungipara", "টুংগীপাড়া"]],
  "Kishoreganj": [["Austagram", "অষ্টগ্রাম"], ["Bajitpur", "বাজিতপুর"], ["Bhairab", "ভৈরব"], ["Hossainpur", "হোসেনপুর"], ["Itna", "ইটনা"], ["Karimgonj", "করিমগঞ্জ"], ["Katiadi", "কটিয়াদী"], ["Kishoreganj Sadar", "কিশোরগঞ্জ সদর"], ["Kuliarchar", "কুলিয়ারচর"], ["Mithamoin", "মিঠামইন"], ["Nikli", "নিকলী"], ["Pakundia", "পাকুন্দিয়া"], ["Tarail", "তাড়াইল"]],
  "Madaripur": [["Dasar", "ডাসার"], ["Kalkini", "কালকিনি"], ["Madaripur Sadar", "মাদারীপুর সদর"], ["Rajoir", "রাজৈর"], ["Shibchar", "শিবচর"]],
  "Manikganj": [["Doulatpur", "দৌলতপুর"], ["Gior", "ঘিওর"], ["Harirampur", "হরিরামপুর"], ["Manikganj Sadar", "মানিকগঞ্জ সদর"], ["Saturia", "সাটুরিয়া"], ["Shibaloy", "শিবালয়"], ["Singiar", "সিংগাইর"]],
  "Munshiganj": [["Gajaria", "গজারিয়া"], ["Louhajanj", "লৌহজং"], ["Munshiganj Sadar", "মুন্সিগঞ্জ সদর"], ["Sirajdikhan", "সিরাজদিখান"], ["Sreenagar", "শ্রীনগর"], ["Tongibari", "টংগীবাড়ি"]],
  "Narayanganj": [["Narayanganj City", "নারায়ণগঞ্জ সিটি"], ["Araihazar", "আড়াইহাজার"], ["Bandar", "বন্দর"], ["Narayanganj Sadar", "নারায়নগঞ্জ সদর"], ["Rupganj", "রূপগঞ্জ"], ["Sonargaon", "সোনারগাঁ"]],
  "Narsingdi": [["Belabo", "বেলাবো"], ["Monohardi", "মনোহরদী"], ["Narsingdi Sadar", "নরসিংদী সদর"], ["Palash", "পলাশ"], ["Raipura", "রায়পুরা"], ["Shibpur", "শিবপুর"]],
  "Rajbari": [["Baliakandi", "বালিয়াকান্দি"], ["Goalanda", "গোয়ালন্দ"], ["Kalukhali", "কালুখালী"], ["Pangsa", "পাংশা"], ["Rajbari Sadar", "রাজবাড়ী সদর"]],
  "Shariatpur": [["Bhedarganj", "ভেদরগঞ্জ"], ["Damudya", "ডামুড্যা"], ["Gosairhat", "গোসাইরহাট"], ["Naria", "নড়িয়া"], ["Shariatpur Sadar", "শরিয়তপুর সদর"], ["Zajira", "জাজিরা"]],
  "Tangail": [["Basail", "বাসাইল"], ["Bhuapur", "ভুয়াপুর"], ["Delduar", "দেলদুয়ার"], ["Dhanbari", "ধনবাড়ী"], ["Ghatail", "ঘাটাইল"], ["Gopalpur", "গোপালপুর"], ["Kalihati", "কালিহাতী"], ["Madhupur", "মধুপুর"], ["Mirzapur", "মির্জাপুর"], ["Nagarpur", "নাগরপুর"], ["Sakhipur", "সখিপুর"], ["Tangail Sadar", "টাঙ্গাইল সদর"]],
  "Bagerhat": [["Bagerhat Sadar", "বাগেরহাট সদর"], ["Chitalmari", "চিতলমারী"], ["Fakirhat", "ফকিরহাট"], ["Kachua", "কচুয়া"], ["Mollahat", "মোল্লাহাট"], ["Mongla", "মোংলা"], ["Morrelganj", "মোড়েলগঞ্জ"], ["Rampal", "রামপাল"], ["Sarankhola", "শরণখোলা"]],
  "Chuadanga": [["Alamdanga", "আলমডাঙ্গা"], ["Chuadanga Sadar", "চুয়াডাঙ্গা সদর"], ["Damurhuda", "দামুড়হুদা"], ["Jibannagar", "জীবননগর"]],
  "Jashore": [["Abhaynagar", "অভয়নগর"], ["Bagherpara", "বাঘারপাড়া"], ["Chougachha", "চৌগাছা"], ["Jashore Sadar", "যশোর সদর"], ["Jhikargacha", "ঝিকরগাছা"], ["Keshabpur", "কেশবপুর"], ["Manirampur", "মণিরামপুর"], ["Sharsha", "শার্শা"]],
  "Jhenaidah": [["Harinakundu", "হরিণাকুন্ডু"], ["Jhenaidah Sadar", "ঝিনাইদহ সদর"], ["Kaliganj", "কালীগঞ্জ"], ["Kotchandpur", "কোটচাঁদপুর"], ["Moheshpur", "মহেশপুর"], ["Shailkupa", "শৈলকুপা"]],
  "Khulna": [["Khulna City", "খুলনা সিটি"], ["Botiaghata", "বটিয়াঘাটা"], ["Dakop", "দাকোপ"], ["Digholia", "দিঘলিয়া"], ["Dumuria", "ডুমুরিয়া"], ["Fultola", "ফুলতলা"], ["Koyra", "কয়রা"], ["Paikgasa", "পাইকগাছা"], ["Rupsha", "রূপসা"], ["Terokhada", "তেরখাদা"]],
  "Kushtia": [["Bheramara", "ভেড়ামারা"], ["Daulatpur", "দৌলতপুর"], ["Khoksa", "খোকসা"], ["Kumarkhali", "কুমারখালী"], ["Kushtia Sadar", "কুষ্টিয়া সদর"], ["Mirpur", "মিরপুর"]],
  "Magura": [["Magura Sadar", "মাগুরা সদর"], ["Mohammadpur", "মহম্মদপুর"], ["Shalikha", "শালিখা"], ["Sreepur", "শ্রীপুর"]],
  "Meherpur": [["Gangni", "গাংনী"], ["Meherpur Sadar", "মেহেরপুর সদর"], ["Mujibnagar", "মুজিবনগর"]],
  "Narail": [["Kalia", "কালিয়া"], ["Lohagara", "লোহাগড়া"], ["Narail Sadar", "নড়াইল সদর"]],
  "Satkhira": [["Assasuni", "আশাশুনি"], ["Debhata", "দেবহাটা"], ["Kalaroa", "কলারোয়া"], ["Kaliganj", "কালিগঞ্জ"], ["Satkhira Sadar", "সাতক্ষীরা সদর"], ["Shyamnagar", "শ্যামনগর"], ["Tala", "তালা"]],
  "Jamalpur": [["Bokshiganj", "বকশীগঞ্জ"], ["Dewangonj", "দেওয়ানগঞ্জ"], ["Islampur", "ইসলামপুর"], ["Jamalpur Sadar", "জামালপুর সদর"], ["Madarganj", "মাদারগঞ্জ"], ["Melandah", "মেলান্দহ"], ["Sarishabari", "সরিষাবাড়ী"]],
  "Mymensingh": [["Mymensingh City", "ময়মনসিংহ সিটি"], ["Bhaluka", "ভালুকা"], ["Dhobaura", "ধোবাউড়া"], ["Fulbaria", "ফুলবাড়ীয়া"], ["Gafargaon", "গফরগাঁও"], ["Gouripur", "গৌরীপুর"], ["Haluaghat", "হালুয়াঘাট"], ["Iswarganj", "ঈশ্বরগঞ্জ"], ["Muktagacha", "মুক্তাগাছা"], ["Mymensingh Sadar", "ময়মনসিংহ সদর"], ["Nandail", "নান্দাইল"], ["Phulpur", "ফুলপুর"], ["Tarakanda", "তারাকান্দা"], ["Trishal", "ত্রিশাল"]],
  "Netrokona": [["Atpara", "আটপাড়া"], ["Barhatta", "বারহাট্টা"], ["Durgapur", "দুর্গাপুর"], ["Kalmakanda", "কলমাকান্দা"], ["Kendua", "কেন্দুয়া"], ["Khaliajuri", "খালিয়াজুরী"], ["Madan", "মদন"], ["Mohongonj", "মোহনগঞ্জ"], ["Netrokona Sadar", "নেত্রকোণা সদর"], ["Purbadhala", "পূর্বধলা"]],
  "Sherpur": [["Jhenaigati", "ঝিনাইগাতী"], ["Nalitabari", "নালিতাবাড়ী"], ["Nokla", "নকলা"], ["Sherpur Sadar", "শেরপুর সদর"], ["Sreebordi", "শ্রীবরদী"]],
  "Bogura": [["Adamdighi", "আদমদিঘি"], ["Bogura Sadar", "বগুড়া সদর"], ["Dhunot", "ধুনট"], ["Dupchanchia", "দুপচাঁচিয়া"], ["Gabtali", "গাবতলী"], ["Kahaloo", "কাহালু"], ["Nondigram", "নন্দিগ্রাম"], ["Shajahanpur", "শাজাহানপুর"], ["Shariakandi", "সারিয়াকান্দি"], ["Sherpur", "শেরপুর"], ["Shibganj", "শিবগঞ্জ"], ["Sonatala", "সোনাতলা"]],
  "Chapainawabganj": [["Bholahat", "ভোলাহাট"], ["Chapainawabganj Sadar", "চাঁপাইনবাবগঞ্জ সদর"], ["Gomostapur", "গোমস্তাপুর"], ["Nachol", "নাচোল"], ["Shibganj", "শিবগঞ্জ"]],
  "Joypurhat": [["Akkelpur", "আক্কেলপুর"], ["Joypurhat Sadar", "জয়পুরহাট সদর"], ["Kalai", "কালাই"], ["Khetlal", "ক্ষেতলাল"], ["Panchbibi", "পাঁচবিবি"]],
  "Naogaon": [["Atrai", "আত্রাই"], ["Badalgachi", "বদলগাছী"], ["Dhamoirhat", "ধামইরহাট"], ["Manda", "মান্দা"], ["Mohadevpur", "মহাদেবপুর"], ["Naogaon Sadar", "নওগাঁ সদর"], ["Niamatpur", "নিয়ামতপুর"], ["Patnitala", "পত্নিতলা"], ["Porsha", "পোরশা"], ["Raninagar", "রাণীনগর"], ["Sapahar", "সাপাহার"]],
  "Natore": [["Bagatipara", "বাগাতিপাড়া"], ["Baraigram", "বড়াইগ্রাম"], ["Gurudaspur", "গুরুদাসপুর"], ["Lalpur", "লালপুর"], ["Naldanga", "নলডাঙ্গা"], ["Natore Sadar", "নাটোর সদর"], ["Singra", "সিংড়া"]],
  "Pabna": [["Atghoria", "আটঘরিয়া"], ["Bera", "বেড়া"], ["Bhangura", "ভাঙ্গুড়া"], ["Chatmohar", "চাটমোহর"], ["Faridpur", "ফরিদপুর"], ["Ishurdi", "ঈশ্বরদী"], ["Pabna Sadar", "পাবনা সদর"], ["Santhia", "সাঁথিয়া"], ["Sujanagar", "সুজানগর"]],
  "Rajshahi": [["Rajshahi City", "রাজশাহী সিটি"], ["Bagha", "বাঘা"], ["Bagmara", "বাগমারা"], ["Charghat", "চারঘাট"], ["Durgapur", "দুর্গাপুর"], ["Godagari", "গোদাগাড়ী"], ["Mohonpur", "মোহনপুর"], ["Paba", "পবা"], ["Puthia", "পুঠিয়া"], ["Tanore", "তানোর"]],
  "Sirajganj": [["Belkuchi", "বেলকুচি"], ["Chauhali", "চৌহালি"], ["Kamarkhand", "কামারখন্দ"], ["Kazipur", "কাজীপুর"], ["Raigonj", "রায়গঞ্জ"], ["Shahjadpur", "শাহজাদপুর"], ["Sirajganj Sadar", "সিরাজগঞ্জ সদর"], ["Tarash", "তাড়াশ"], ["Ullapara", "উল্লাপাড়া"]],
  "Dinajpur": [["Birampur", "বিরামপুর"], ["Birganj", "বীরগঞ্জ"], ["Birol", "বিরল"], ["Bochaganj", "বোচাগঞ্জ"], ["Chirirbandar", "চিরিরবন্দর"], ["Dinajpur Sadar", "দিনাজপুর সদর"], ["Fulbari", "ফুলবাড়ী"], ["Ghoraghat", "ঘোড়াঘাট"], ["Hakimpur", "হাকিমপুর"], ["Kaharol", "কাহারোল"], ["Khansama", "খানসামা"], ["Nawabganj", "নবাবগঞ্জ"], ["Parbatipur", "পার্বতীপুর"]],
  "Gaibandha": [["Gaibandha Sadar", "গাইবান্ধা সদর"], ["Gobindaganj", "গোবিন্দগঞ্জ"], ["Palashbari", "পলাশবাড়ী"], ["Phulchari", "ফুলছড়ি"], ["Sadullapur", "সাদুল্লাপুর"], ["Saghata", "সাঘাটা"], ["Sundarganj", "সুন্দরগঞ্জ"]],
  "Kurigram": [["Bhurungamari", "ভুরুঙ্গামারী"], ["Charrajibpur", "চর রাজিবপুর"], ["Chilmari", "চিলমারী"], ["Kurigram Sadar", "কুড়িগ্রাম সদর"], ["Nageshwari", "নাগেশ্বরী"], ["Phulbari", "ফুলবাড়ী"], ["Rajarhat", "রাজারহাট"], ["Rowmari", "রৌমারী"], ["Ulipur", "উলিপুর"]],
  "Lalmonirhat": [["Aditmari", "আদিতমারী"], ["Hatibandha", "হাতীবান্ধা"], ["Kaliganj", "কালীগঞ্জ"], ["Lalmonirhat Sadar", "লালমনিরহাট সদর"], ["Patgram", "পাটগ্রাম"]],
  "Nilphamari": [["Dimla", "ডিমলা"], ["Domar", "ডোমার"], ["Jaldhaka", "জলঢাকা"], ["Kishorganj", "কিশোরগঞ্জ"], ["Nilphamari Sadar", "নীলফামারী সদর"], ["Syedpur", "সৈয়দপুর"]],
  "Panchagarh": [["Atwari", "আটোয়ারী"], ["Boda", "বোদা"], ["Debiganj", "দেবীগঞ্জ"], ["Panchagarh Sadar", "পঞ্চগড় সদর"], ["Tetulia", "তেতুলিয়া"]],
  "Rangpur": [["Rangpur City", "রংপুর সিটি"], ["Badargonj", "বদরগঞ্জ"], ["Gangachara", "গংগাচড়া"], ["Kaunia", "কাউনিয়া"], ["Mithapukur", "মিঠাপুকুর"], ["Pirgacha", "পীরগাছা"], ["Pirgonj", "পীরগঞ্জ"], ["Rangpur Sadar", "রংপুর সদর"], ["Taragonj", "তারাগঞ্জ"]],
  "Thakurgaon": [["Baliadangi", "বালিয়াডাঙ্গী"], ["Haripur", "হরিপুর"], ["Pirganj", "পীরগঞ্জ"], ["Ranisankail", "রাণীশংকৈল"], ["Thakurgaon Sadar", "ঠাকুরগাঁও সদর"]],
  "Habiganj": [["Ajmiriganj", "আজমিরীগঞ্জ"], ["Bahubal", "বাহুবল"], ["Baniachong", "বানিয়াচং"], ["Chunarughat", "চুনারুঘাট"], ["Habiganj Sadar", "হবিগঞ্জ সদর"], ["Lakhai", "লাখাই"], ["Madhabpur", "মাধবপুর"], ["Nabiganj", "নবীগঞ্জ"]],
  "Moulvibazar": [["Barlekha", "বড়লেখা"], ["Juri", "জুড়ী"], ["Kamolganj", "কমলগঞ্জ"], ["Kulaura", "কুলাউড়া"], ["Moulvibazar Sadar", "মৌলভীবাজার সদর"], ["Rajnagar", "রাজনগর"], ["Sreemangal", "শ্রীমঙ্গল"]],
  "Sunamganj": [["Bishwambarpur", "বিশ্বম্ভরপুর"], ["Chhatak", "ছাতক"], ["Derai", "দিরাই"], ["Dharmapasha", "ধর্মপাশা"], ["Dowarabazar", "দোয়ারাবাজার"], ["Jagannathpur", "জগন্নাথপুর"], ["Jamalganj", "জামালগঞ্জ"], ["Madhyanagar", "মধ্যনগর"], ["Shalla", "শাল্লা"], ["South Sunamganj", "দক্ষিণ সুনামগঞ্জ"], ["Sunamganj Sadar", "সুনামগঞ্জ সদর"], ["Tahirpur", "তাহিরপুর"]],
  "Sylhet": [["Sylhet City", "সিলেট সিটি"], ["Balaganj", "বালাগঞ্জ"], ["Beanibazar", "বিয়ানীবাজার"], ["Bishwanath", "বিশ্বনাথ"], ["Companiganj", "কোম্পানীগঞ্জ"], ["Dakshinsurma", "দক্ষিণ সুরমা"], ["Fenchuganj", "ফেঞ্চুগঞ্জ"], ["Golapganj", "গোলাপগঞ্জ"], ["Gowainghat", "গোয়াইনঘাট"], ["Jaintiapur", "জৈন্তাপুর"], ["Kanaighat", "কানাইঘাট"], ["Osmaninagar", "ওসমানী নগর"], ["Sylhet Sadar", "সিলেট সদর"], ["Zakiganj", "জকিগঞ্জ"]],
};

const key = (s: string) => s.normalize('NFC').toLowerCase().replace(/[^a-zঀ-৿]/g, '');

/** The official name of the upazila (or city) this text names within a district, or null. */
export function canonicalUpazila(district: string, text?: string | null): string | null {
  if (!text) return null;
  const k = key(text);
  const hit = (UPAZILAS[district] ?? []).find(([en, bn]) => key(en) === k || key(bn) === k);
  return hit ? hit[0] : null;
}
