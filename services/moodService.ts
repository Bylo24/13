import { supabase } from '../utils/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MoodRating } from '../types';
import { getCurrentSubscriptionTier } from './subscriptionService';

// Interface for mood entry
export interface MoodEntry {
  id?: string;
  user_id?: string;
  date: string;
  rating: MoodRating;
  details?: string;
  created_at?: string;
}

// Interface for detailed mood entry
export interface DetailedMoodEntry {
  id?: string;
  user_id?: string;
  date: string;
  time?: string;
  rating: MoodRating;
  note?: string;
  emotion_details?: string;
  created_at?: string;
}

// Helper function to get today's date in user's local time zone
function getLocalToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Save a mood entry to Supabase
export async function saveMoodEntry(rating: MoodRating, details: string = ''): Promise<MoodEntry | null> {
  try {
    // Get the current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.log('No active session found when saving mood entry');
      return null;
    }
    
    const userId = session.user.id;
    
    // Get today's date in local time zone
    const today = getLocalToday();
    
    // Check subscription tier
    const subscriptionTier = await getCurrentSubscriptionTier();
    const isPremium = subscriptionTier === 'premium';
    
    // If premium user, save to detailed table and update/create summary entry
    if (isPremium) {
      // Save detailed entry
      const { data: detailedEntry, error: detailedError } = await supabase
        .from('mood_entries_detailed')
        .insert([
          { 
            user_id: userId, 
            date: today, 
            time: new Date().toISOString().split('T')[1], 
            rating, 
            note: details,
            emotion_details: details
          }
        ])
        .select()
        .single();
      
      if (detailedError) {
        console.error('Error inserting detailed mood entry:', detailedError);
        return null;
      }
      
      console.log('Inserted new detailed mood entry:', detailedEntry);
      
      // Get all entries for today to calculate average
      const { data: todayEntries, error: entriesError } = await supabase
        .from('mood_entries_detailed')
        .select('rating')
        .eq('user_id', userId)
        .eq('date', today);
      
      if (entriesError) {
        console.error('Error fetching today\'s mood entries:', entriesError);
        return null;
      }
      
      // Calculate average rating
      const sum = todayEntries.reduce((total, entry) => total + entry.rating, 0);
      const averageRating = Math.round(sum / todayEntries.length) as MoodRating;
      
      // Check if a summary entry already exists for today
      const { data: existingEntry, error: checkError } = await supabase
        .from('mood_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .single();
      
      let result;
      
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking for existing entry:', checkError);
      }
      
      if (existingEntry) {
        // Update the existing summary entry with the new average
        const { data, error } = await supabase
          .from('mood_entries')
          .update({ 
            rating: averageRating, 
            emotion_details: details || existingEntry.emotion_details,
            note: details || existingEntry.note
          })
          .eq('id', existingEntry.id)
          .select()
          .single();
        
        if (error) {
          console.error('Error updating mood entry:', error);
          return null;
        }
        
        result = data;
        console.log('Updated mood entry with new average:', data);
      } else {
        // Insert a new summary entry
        const { data, error } = await supabase
          .from('mood_entries')
          .insert([
            { 
              user_id: userId, 
              date: today, 
              rating: averageRating, 
              emotion_details: details,
              note: details
            }
          ])
          .select()
          .single();
        
        if (error) {
          console.error('Error inserting mood entry:', error);
          return null;
        }
        
        result = data;
        console.log('Inserted new mood entry with average:', data);
      }
      
      // Store the most recent mood in AsyncStorage for persistence
      await AsyncStorage.setItem('last_mood_rating', averageRating.toString());
      
      return result;
    } else {
      // For free users, just use the original logic (one entry per day)
      // Check if an entry already exists for today
      const { data: existingEntry, error: checkError } = await supabase
        .from('mood_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .single();
      
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking for existing entry:', checkError);
      }
      
      let result;
      
      if (existingEntry) {
        // Update the existing entry
        const { data, error } = await supabase
          .from('mood_entries')
          .update({ 
            rating, 
            emotion_details: details,
            note: details
          })
          .eq('id', existingEntry.id)
          .select()
          .single();
        
        if (error) {
          console.error('Error updating mood entry:', error);
          return null;
        }
        
        result = data;
        console.log('Updated mood entry:', data);
      } else {
        // Insert a new entry
        const { data, error } = await supabase
          .from('mood_entries')
          .insert([
            { 
              user_id: userId, 
              date: today, 
              rating, 
              emotion_details: details,
              note: details
            }
          ])
          .select()
          .single();
        
        if (error) {
          console.error('Error inserting mood entry:', error);
          return null;
        }
        
        result = data;
        console.log('Inserted new mood entry:', data);
      }
      
      // Store the most recent mood in AsyncStorage for persistence
      await AsyncStorage.setItem('last_mood_rating', rating.toString());
      
      return result;
    }
  } catch (error) {
    console.error('Error in saveMoodEntry:', error);
    return null;
  }
}

// Get today's mood entry
export async function getTodayMoodEntry(): Promise<MoodEntry | null> {
  try {
    // Get the current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.log('No active session found when getting today\'s mood entry');
      return null;
    }
    
    const userId = session.user.id;
    
    // Get today's date in local time zone
    const today = getLocalToday();
    
    // Query mood entry for today
    const { data, error } = await supabase
      .from('mood_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No entry found for today
        console.log('No mood entry found for today');
        return null;
      }
      console.error('Error fetching today\'s mood entry:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in getTodayMoodEntry:', error);
    return null;
  }
}

// Get the most recent mood entry
export async function getMostRecentMoodEntry(): Promise<MoodEntry | null> {
  try {
    // Get the current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.log('No active session found when getting most recent mood entry');
      return null;
    }
    
    const userId = session.user.id;
    
    // Query the most recent mood entry
    const { data, error } = await supabase
      .from('mood_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No entries found
        console.log('No mood entries found');
        return null;
      }
      console.error('Error fetching most recent mood entry:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in getMostRecentMoodEntry:', error);
    return null;
  }
}

// Get today's detailed mood entries (for premium users)
export async function getTodayDetailedMoodEntries(): Promise<DetailedMoodEntry[]> {
  try {
    // Get the current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.log('No active session found when getting today\'s detailed mood entries');
      return [];
    }
    
    const userId = session.user.id;
    
    // Get today's date in local time zone
    const today = getLocalToday();
    
    // Query detailed mood entries for today
    const { data, error } = await supabase
      .from('mood_entries_detailed')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .order('time', { ascending: true });
    
    if (error) {
      console.error('Error fetching today\'s detailed mood entries:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in getTodayDetailedMoodEntries:', error);
    return [];
  }
}

// Get recent mood entries (last n days)
export async function getRecentMoodEntries(days: number = 7): Promise<MoodEntry[]> {
  try {
    // Get the current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.log('No active session found when getting recent mood entries');
      return [];
    }
    
    const userId = session.user.id;
    
    // Calculate the date range in local time
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Format dates as YYYY-MM-DD in local time
    const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
    const endDateStr = getLocalToday();
    
    // Query mood entries within the date range
    const { data, error } = await supabase
      .from('mood_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .order('date', { ascending: true });
    
    if (error) {
      console.error('Error fetching recent mood entries:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in getRecentMoodEntries:', error);
    return [];
  }
}

// Get the current mood streak
export async function getMoodStreak(): Promise<number> {
  try {
    // Get the current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.log('No active session found when getting mood streak');
      return 0;
    }
    
    const userId = session.user.id;
    
    // Get all mood entries for this user, ordered by date descending
    const { data, error } = await supabase
      .from('mood_entries')
      .select('date')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    
    if (error) {
      console.error('Error fetching mood entries for streak calculation:', error);
      return 0;
    }
    
    if (!data || data.length === 0) {
      return 0;
    }
    
    // Calculate streak
    let streak = 1; // Start with 1 for the most recent entry
    
    // Create a map of dates with entries
    const dateMap = new Map();
    data.forEach(entry => {
      dateMap.set(entry.date, true);
    });
    
    // Get the most recent entry date
    const mostRecentDate = new Date(data[0].date);
    
    // Check previous days
    for (let i = 1; i <= 365; i++) { // Check up to a year back
      const prevDate = new Date(mostRecentDate);
      prevDate.setDate(prevDate.getDate() - i);
      const dateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
      
      if (dateMap.has(dateStr)) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  } catch (error) {
    console.error('Error in getMoodStreak:', error);
    return 0;
  }
}

// Get average mood for a specified number of days
export async function getAverageMood(days: number = 30): Promise<number | null> {
  try {
    // Get recent mood entries for the specified number of days
    const entries = await getRecentMoodEntries(days);
    
    if (entries.length === 0) {
      return null;
    }
    
    // Calculate the average rating
    const sum = entries.reduce((total, entry) => total + entry.rating, 0);
    return sum / entries.length;
  } catch (error) {
    console.error('Error in getAverageMood:', error);
    return null;
  }
}

// Get weekly average mood
export async function getWeeklyAverageMood(): Promise<number | null> {
  try {
    const entries = await getRecentMoodEntries(7);
    
    if (entries.length === 0) {
      return null;
    }
    
    const sum = entries.reduce((total, entry) => total + entry.rating, 0);
    return sum / entries.length;
  } catch (error) {
    console.error('Error in getWeeklyAverageMood:', error);
    return null;
  }
}

// Get current week's mood entries
export async function getCurrentWeekMoodEntries(): Promise<MoodEntry[]> {
  try {
    // Get the current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.log('No active session found when getting current week mood entries');
      return [];
    }
    
    const userId = session.user.id;
    
    // Calculate the start of the current week (Sunday) in local time
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Format dates as YYYY-MM-DD in local time
    const startDateStr = `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, '0')}-${String(startOfWeek.getDate()).padStart(2, '0')}`;
    const endDateStr = getLocalToday();
    
    // Query mood entries for the current week
    const { data, error } = await supabase
      .from('mood_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDateStr)
      .lte('date', endDateStr)
      .order('date', { ascending: true });
    
    if (error) {
      console.error('Error fetching current week mood entries:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in getCurrentWeekMoodEntries:', error);
    return [];
  }
}