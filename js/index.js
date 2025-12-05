import { auth, db, storage, ref, uploadBytes, getDownloadURL, deleteObject,
         onAuthStateChanged, signOut, collection, addDoc,
         getDocs, doc, getDoc, updateDoc, deleteDoc, query, where,
         orderBy, serverTimestamp } from './firebase-config.js';
import { showLoading, showError, showSuccess, handleError } from './utils.js';

// User profile cache to avoid redundant fetches
const userProfileCache = new Map();

// Wait for DOM and deferred scripts to load
document.addEventListener('DOMContentLoaded', function() {
    let map;
    let markers;
    let allMarkers = [];
    let searchTimeout;
    let creationMode = false;
    let tempMarker = null;
    let clickLat, clickLon;
    let currentUser = null;
    let currentUserData = null;
    let editingLocationId = null;
    let selectedNewImage = null;
    let selectedEditImage = null;
    let currentLocationImageUrl = null;

    // Session Check: Redirect to login if not authenticated
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = './login.html';
            return;
        }

        currentUser = user;

        // Load user profile from Firestore
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                currentUserData = userDoc.data();
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
        }

        // Initialize map after authentication
        initializeMap();
    });

    function initializeMap() {
        // Initialize the map with default view (will be updated if geolocation succeeds)
        map = L.map('map').setView([39.8283, -98.5795], 4);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        markers = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: true,
            zoomToBoundsOnClick: true
        });

         // Add marker cluster group to map once during initialization
         map.addLayer(markers);

        // Try to get user's location and center map on it
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                // Success callback
                function(position) {
                    const userLat = position.coords.latitude;
                    const userLon = position.coords.longitude;

                    // Center map on user's location with closer zoom
                    map.setView([userLat, userLon], 13);

                    console.log(`Map centered on user location: ${userLat.toFixed(6)}, ${userLon.toFixed(6)}`);
                },
                // Error callback
                function(error) {
                    console.log('Geolocation error or denied:', error.message);
                    console.log('Using default map center (US)');
                },
                // Options
                {
                    enableHighAccuracy: false,
                    timeout: 5000,
                    maximumAge: 0
                }
            );
        } else {
            console.log('Geolocation not supported by browser. Using default map center.');
        }

        // Load locations from Firestore
        loadLocationsFromFirestore();

        // Event listeners
        document.getElementById('add-btn').addEventListener('click', toggleCreationMode);
        document.getElementById('search').addEventListener('input', handleSearch);
        document.getElementById('settings-btn').addEventListener('click', () => {
            window.location.href = './settings.html';
        });
        document.getElementById('submit-location-btn').addEventListener('click', submitNewLocation);
        document.getElementById('cancel-location-btn').addEventListener('click', cancelNewLocation);
        document.getElementById('update-location-btn').addEventListener('click', updateLocation);
        document.getElementById('delete-location-btn').addEventListener('click', deleteLocation);
        document.getElementById('cancel-edit-btn').addEventListener('click', cancelEdit);
        
        // Image upload event listeners
        document.getElementById('new-image').addEventListener('change', handleNewImageSelect);
        document.getElementById('edit-image').addEventListener('change', handleEditImageSelect);
        document.getElementById('remove-image-btn').addEventListener('click', handleRemoveImage);

        // PWA: Register Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => console.log('SW registered: ', registration))
                .catch(error => console.log('SW registration failed: ', error));
        }

        // PWA: Offline Detection
        window.addEventListener('online', () => {
            document.getElementById('offline-message').style.display = 'none';
        });
        window.addEventListener('offline', () => {
            document.getElementById('offline-message').style.display = 'block';
            if (creationMode) {
                showError('Offline: Cannot add new locations. Reload when online.');
            }
        });
    }

    // Helper function to fetch user profile with caching
    async function fetchUserProfile(userId) {
        if (!userId) {
            return { displayName: 'Unknown User', email: '' };
        }

        // Check cache first
        if (userProfileCache.has(userId)) {
            return userProfileCache.get(userId);
        }

        // Fetch from Firestore
        try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                const profile = {
                    displayName: userData.displayName || userData.email || 'Unknown User',
                    email: userData.email || ''
                };
                userProfileCache.set(userId, profile);
                return profile;
            }
        } catch (error) {
            console.error('Error loading user:', error);
        }

        // Return default and cache it
        const defaultProfile = { displayName: 'Unknown User', email: '' };
        userProfileCache.set(userId, defaultProfile);
        return defaultProfile;
    }

    // Load locations from Firestore with optimized performance
    async function loadLocationsFromFirestore() {
        showLoading(true);
        try {
            // Clear existing markers from the cluster group
            markers.clearLayers();
                 
            const locationsRef = collection(db, 'locations');
            const q = query(locationsRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);

            // Hide loading overlay early - we'll show markers immediately
            showLoading(false);

            allMarkers = [];
            const locationData = [];
            const uniqueUserIds = new Set();

            // First pass: collect all location data and unique user IDs
            for (const docSnap of querySnapshot.docs) {
                const data = docSnap.data();
                const locationId = docSnap.id;

                const lat = parseFloat(data.latitude);
                const lon = parseFloat(data.longitude);
                const title = data.title || 'Untitled Location';
                const notes = data.notes || '';
                const address = data.address || '';
                const userId = data.userId || '';

                if (!isNaN(lat) && !isNaN(lon)) {
                    locationData.push({
                        locationId,
                        title,
                        notes,
                        address,
                        userId,
                        lat,
                        lon
                    });

                    if (userId) {
                        uniqueUserIds.add(userId);
                    }
                }
            }

            // Fetch all unique user profiles in parallel
            const userIds = Array.from(uniqueUserIds);
            const userProfilePromises = userIds.map(userId => fetchUserProfile(userId));
            await Promise.all(userProfilePromises);

            // Second pass: create markers with cached user data
            let validMarkers = 0;
            const batchSize = 100; // Increased batch size since we're not waiting for user fetches
            let currentBatch = [];

            for (const location of locationData) {
                const { locationId, title, notes, address, userId, lat, lon } = location;

                // Get username from cache (already fetched)
                const userProfile = await fetchUserProfile(userId);
                const username = userProfile.displayName;

                // Get voting data from the original Firestore document
                const locationDoc = querySnapshot.docs.find(doc => doc.id === locationId);
                const locationDocData = locationDoc ? locationDoc.data() : {};
                const upvotes = locationDocData.upvotes || [];
                const downvotes = locationDocData.downvotes || [];

                const popupContent = createPopupContent(locationId, title, lat, lon, notes, address, username, userId, upvotes, downvotes);
                const marker = L.marker([lat, lon]).bindPopup(popupContent);

                const markerObj = {
                    locationId,
                    title,
                    notes,
                    address,
                    user: username,
                    userId,
                    lat,
                    lon,
                    upvotes,
                    downvotes,
                    marker
                };

                allMarkers.push(markerObj);
                currentBatch.push(markerObj);
                validMarkers++;

                // Add markers in larger batches
                if (currentBatch.length >= batchSize) {
                    currentBatch.forEach(obj => markers.addLayer(obj.marker));
                    currentBatch = [];
                }
            }

            // Add remaining markers
            currentBatch.forEach(obj => markers.addLayer(obj.marker));

            console.log(`${validMarkers} markers loaded from Firestore.`);
        } catch (error) {
            console.error('Error loading locations:', error);
            showError('Failed to load locations. Please refresh the page.');
            showLoading(false);
        }
    }

    // Create popup content
    function createPopupContent(locationId, title, lat, lon, notes, address, user, userId, upvotes = [], downvotes = []) {
        let popupContent = `<b>${title}</b><br>`;
        
        // Calculate and display vote score
        const upvoteCount = upvotes.length;
        const downvoteCount = downvotes.length;
        const voteScore = upvoteCount - downvoteCount;
        
        // Determine color based on score
        let scoreColor = '#666'; // gray for zero
        let scorePrefix = '';
        if (voteScore > 0) {
            scoreColor = '#28a745'; // green for positive
            scorePrefix = '+';
        } else if (voteScore < 0) {
            scoreColor = '#dc3545'; // red for negative
        }
        
        // Add vote score display
        popupContent += `<div style="margin: 8px 0; padding: 6px 10px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid ${scoreColor};">
            <strong style="color: ${scoreColor}; font-size: 14px;">Score: ${scorePrefix}${voteScore}</strong>
            <span style="color: #666; font-size: 12px; margin-left: 8px;">(↑${upvoteCount} ↓${downvoteCount})</span>
        </div>`;
        
        if (address) {
            popupContent += `<br><strong>Address:</strong><br>${address}`;
        }
        if (user) {
            popupContent += `<br><strong>Added By:</strong><br>${user}`;
        }
        if (notes) {
            popupContent += `<br><br><strong>Notes:</strong><br>${notes}`;
        }

        // Add View Details link
        popupContent += `<br><br><a href="./location.html?id=${locationId}" class="btn btn-primary btn-popup" style="color:white;">View Details</a>`;

        // Add Edit/Delete buttons if user owns this location
        if (currentUser && userId === currentUser.uid) {
            popupContent += `
                <div class="popup-actions">
                    <button class="btn btn-primary btn-popup" onclick="window.editLocation('${locationId}')">Edit</button>
                    <button class="btn btn-danger btn-popup" onclick="window.confirmDeleteLocation('${locationId}')">Delete</button>
                </div>
            `;
        }

        return popupContent;
    }

    // Edit location
    window.editLocation = async function(locationId) {
        try {
            const locationDoc = await getDoc(doc(db, 'locations', locationId));
            if (locationDoc.exists()) {
                const data = locationDoc.data();
                editingLocationId = locationId;
                currentLocationImageUrl = data.imageUrl || null;

                document.getElementById('edit-title').value = data.title || '';
                document.getElementById('edit-notes').value = data.notes || '';
                document.getElementById('edit-address').value = data.address || '';

                // Display current image if exists
                const currentImageDiv = document.getElementById('edit-current-image');
                const removeImageBtn = document.getElementById('remove-image-btn');
                
                if (currentLocationImageUrl) {
                    currentImageDiv.innerHTML = `<img src="${currentLocationImageUrl}" alt="${data.title}">`;
                    removeImageBtn.style.display = 'inline-block';
                } else {
                    currentImageDiv.innerHTML = '<div class="no-image">No image</div>';
                    removeImageBtn.style.display = 'none';
                }

                // Clear any previous selections
                document.getElementById('edit-image').value = '';
                document.getElementById('edit-image-preview').innerHTML = '';
                selectedEditImage = null;

                document.getElementById('edit-modal').style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading location:', error);
            showError('Failed to load location details.');
        }
    };

    // Update location
    async function updateLocation() {
        if (!editingLocationId) return;

        const title = document.getElementById('edit-title').value.trim();
        const notes = document.getElementById('edit-notes').value.trim();
        const address = document.getElementById('edit-address').value.trim();

        if (!title) {
            showError('Title is required!');
            return;
        }

        showLoading(true);

        try {
            let imageUrl = currentLocationImageUrl;

            // Handle new image upload
            if (selectedEditImage) {
                // Delete old image if exists
                if (currentLocationImageUrl) {
                    await deleteImageFromStorage(currentLocationImageUrl);
                }

                // Upload new image
                imageUrl = await uploadImageToStorage(selectedEditImage, editingLocationId);
            }

            // Update Firestore
            const updateData = {
                title,
                notes,
                address,
                updatedAt: serverTimestamp()
            };

            if (imageUrl) {
                updateData.imageUrl = imageUrl;
            }

            await updateDoc(doc(db, 'locations', editingLocationId), updateData);

            document.getElementById('edit-modal').style.display = 'none';
            editingLocationId = null;
            selectedEditImage = null;
            currentLocationImageUrl = null;

            // Reload locations
            await loadLocationsFromFirestore();

            showSuccess('Location updated successfully!');
        } catch (error) {
            console.error('Error updating location:', error);
            showError('Failed to update location. Please try again.');
        } finally {
            showLoading(false);
        }
    }

    // Confirm delete location
    window.confirmDeleteLocation = function(locationId) {
        if (confirm('Are you sure you want to delete this location? This cannot be undone.')) {
            deleteLocationById(locationId);
        }
    };

    // Delete location
    async function deleteLocation() {
        if (!editingLocationId) return;

        if (confirm('Are you sure you want to delete this location? This cannot be undone.')) {
            await deleteLocationById(editingLocationId);
            document.getElementById('edit-modal').style.display = 'none';
            editingLocationId = null;
        }
    }

    async function deleteLocationById(locationId) {
        showLoading(true);

        try {
            // Get location data to check for image
            const locationDoc = await getDoc(doc(db, 'locations', locationId));
            if (locationDoc.exists()) {
                const data = locationDoc.data();
                // Delete image from storage if exists
                if (data.imageUrl) {
                    await deleteImageFromStorage(data.imageUrl);
                }
            }

            await deleteDoc(doc(db, 'locations', locationId));

            // Reload locations
            await loadLocationsFromFirestore();

            showSuccess('Location deleted successfully!');
        } catch (error) {
            console.error('Error deleting location:', error);
            showError('Failed to delete location. Please try again.');
        } finally {
            showLoading(false);
        }
    }

    function cancelEdit() {
        document.getElementById('edit-modal').style.display = 'none';
        editingLocationId = null;
        selectedEditImage = null;
        currentLocationImageUrl = null;
        document.getElementById('edit-image-preview').innerHTML = '';
        document.getElementById('edit-current-image').innerHTML = '';
        document.getElementById('remove-image-btn').style.display = 'none';
    }

    // ===== IMAGE HANDLING FUNCTIONS =====

    // Validate image file
    function validateImageFile(file) {
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

        if (!allowedTypes.includes(file.type)) {
            showError('Invalid file type. Please upload JPG, PNG, GIF, or WebP images.');
            return false;
        }

        if (file.size > maxSize) {
            showError('File size exceeds 5MB limit. Please choose a smaller image.');
            return false;
        }

        return true;
    }

    // Handle new image selection (creation modal)
    function handleNewImageSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            selectedNewImage = null;
            document.getElementById('new-image-preview').innerHTML = '';
            return;
        }

        if (!validateImageFile(file)) {
            event.target.value = '';
            selectedNewImage = null;
            return;
        }

        selectedNewImage = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('new-image-preview').innerHTML = `
                <img src="${e.target.result}" alt="Preview">
                <button type="button" class="btn btn-danger" onclick="document.getElementById('new-image').value=''; document.getElementById('new-image-preview').innerHTML=''; selectedNewImage=null;">Remove</button>
            `;
        };
        reader.readAsDataURL(file);
    }

    // Handle edit image selection (edit modal)
    function handleEditImageSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            selectedEditImage = null;
            document.getElementById('edit-image-preview').innerHTML = '';
            return;
        }

        if (!validateImageFile(file)) {
            event.target.value = '';
            selectedEditImage = null;
            return;
        }

        selectedEditImage = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('edit-image-preview').innerHTML = `
                <img src="${e.target.result}" alt="Preview">
                <button type="button" class="btn btn-danger" onclick="document.getElementById('edit-image').value=''; document.getElementById('edit-image-preview').innerHTML=''; selectedEditImage=null;">Remove</button>
            `;
        };
        reader.readAsDataURL(file);
    }

    // Handle remove image button
    async function handleRemoveImage() {
        if (!currentLocationImageUrl || !editingLocationId) return;

        if (!confirm('Are you sure you want to remove this image?')) {
            return;
        }

        showLoading(true);

        try {
            // Delete image from Storage
            await deleteImageFromStorage(currentLocationImageUrl);

            // Update Firestore to remove imageUrl
            await updateDoc(doc(db, 'locations', editingLocationId), {
                imageUrl: null,
                updatedAt: serverTimestamp()
            });

            // Update UI
            currentLocationImageUrl = null;
            document.getElementById('edit-current-image').innerHTML = '<div class="no-image">No image</div>';
            document.getElementById('remove-image-btn').style.display = 'none';

            showSuccess('Image removed successfully!');
        } catch (error) {
            console.error('Error removing image:', error);
            showError('Failed to remove image. Please try again.');
        } finally {
            showLoading(false);
        }
    }

    // Upload image to Firebase Storage
    async function uploadImageToStorage(file, locationId) {
        try {
            const timestamp = Date.now();
            const fileExtension = file.name.split('.').pop();
            const fileName = `${locationId}_${timestamp}.${fileExtension}`;
            const storagePath = `locations/${currentUser.uid}/${fileName}`;
            
            const storageRef = ref(storage, storagePath);
            
            // Upload file
            await uploadBytes(storageRef, file);
            
            // Get download URL
            const downloadURL = await getDownloadURL(storageRef);
            
            return downloadURL;
        } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
        }
    }

    // Delete image from Firebase Storage
    async function deleteImageFromStorage(imageUrl) {
        try {
            // Extract storage path from URL
            const urlParts = imageUrl.split('/o/')[1];
            if (!urlParts) return;
            
            const pathPart = urlParts.split('?')[0];
            const storagePath = decodeURIComponent(pathPart);
            
            const storageRef = ref(storage, storagePath);
            await deleteObject(storageRef);
            
            console.log('Image deleted from storage:', storagePath);
        } catch (error) {
            // Don't throw error if image doesn't exist
            console.error('Error deleting image from storage:', error);
        }
    }

    // Filter markers
    function filterMarkers(searchTerm) {
        const term = searchTerm.trim().toLowerCase();
        markers.clearLayers();
        let visibleCount = 0;

        if (term === '') {
            allMarkers.forEach(markerObj => {
                markers.addLayer(markerObj.marker);
                visibleCount++;
            });
        } else {
            allMarkers.forEach(markerObj => {
                const titleMatch = markerObj.title.toLowerCase().includes(term);
                const notesMatch = markerObj.notes.toLowerCase().includes(term);
                const addressMatch = (markerObj.address || '').toLowerCase().includes(term);
                const userMatch = (markerObj.user || '').toLowerCase().includes(term);

                if (titleMatch || notesMatch || addressMatch || userMatch) {
                    markers.addLayer(markerObj.marker);
                    visibleCount++;
                }
            });
        }

        console.log(`Showing ${visibleCount} markers (search: "${searchTerm}")`);
    }

    // Debounced search handler
    function handleSearch() {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const searchTerm = document.getElementById('search').value;
            filterMarkers(searchTerm);
        }, 300);
    }

    // Toggle creation mode
    function toggleCreationMode() {
        creationMode = !creationMode;
        const addBtn = document.getElementById('add-btn');
        addBtn.classList.toggle('active', creationMode);
        const searchInput = document.getElementById('search');
        searchInput.disabled = creationMode;

        if (creationMode) {
            map.on('click', handleMapClick);
            console.log('Creation mode: ON - Click map to add pin');
        } else {
            map.off('click', handleMapClick);
            if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = null;
            }
            searchInput.disabled = false;
            const currentSearch = searchInput.value;
            if (currentSearch) filterMarkers(currentSearch);
            console.log('Creation mode: OFF');
        }
    }

    // Handle map click in creation mode
    function handleMapClick(e) {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        clickLat = lat;
        clickLon = lon;

        if (tempMarker) {
            map.removeLayer(tempMarker);
        }

        tempMarker = L.marker([lat, lon], {
            icon: L.divIcon({
                className: 'temp-marker',
                html: '<div style="background-color: red; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(map);

        document.getElementById('click-coords').textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        document.getElementById('creation-modal').style.display = 'block';
        document.getElementById('new-title').focus();

        // Pre-fill user field
        const userInput = document.getElementById('new-user');
        if (userInput && currentUserData) {
            userInput.value = currentUserData.displayName || currentUser.email;
        }
    }

    // Submit new location
    async function submitNewLocation() {
        const title = document.getElementById('new-title').value.trim();
        const notes = document.getElementById('new-notes').value.trim();
        const address = document.getElementById('new-address').value.trim();

        if (!title) {
            showError('Title is required!');
            return;
        }

        showLoading(true);

        try {
            // Create location document first
            const locationData = {
                userId: currentUser.uid,
                latitude: clickLat,
                longitude: clickLon,
                title,
                notes,
                address,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            const docRef = await addDoc(collection(db, 'locations'), locationData);
            const locationId = docRef.id;

            // Upload image if selected
            if (selectedNewImage) {
                try {
                    const imageUrl = await uploadImageToStorage(selectedNewImage, locationId);
                    
                    // Update location with image URL
                    await updateDoc(doc(db, 'locations', locationId), {
                        imageUrl: imageUrl
                    });
                } catch (imageError) {
                    console.error('Error uploading image:', imageError);
                    showError('Location created but image upload failed. You can add an image by editing the location.');
                }
            }

            // Clear and close modal
            document.getElementById('new-title').value = '';
            document.getElementById('new-notes').value = '';
            document.getElementById('new-address').value = '';
            document.getElementById('new-image').value = '';
            document.getElementById('new-image-preview').innerHTML = '';
            selectedNewImage = null;
            document.getElementById('creation-modal').style.display = 'none';

            if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = null;
            }

            // Exit creation mode
            toggleCreationMode();

            // Reload locations
            await loadLocationsFromFirestore();

            showSuccess('Location added successfully!');
        } catch (error) {
            console.error('Error adding location:', error);
            showError('Failed to add location. Please try again.');
        } finally {
            showLoading(false);
        }
    }

    // Cancel new location
    function cancelNewLocation() {
        if (tempMarker) {
            map.removeLayer(tempMarker);
            tempMarker = null;
        }
        document.getElementById('creation-modal').style.display = 'none';
        document.getElementById('new-title').value = '';
        document.getElementById('new-notes').value = '';
        document.getElementById('new-address').value = '';
        document.getElementById('new-image').value = '';
        document.getElementById('new-image-preview').innerHTML = '';
        selectedNewImage = null;
    }
});






